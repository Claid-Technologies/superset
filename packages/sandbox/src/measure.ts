/**
 * Measures where the time goes between creating a cloud workspace and its
 * host-service answering, and again on a reopen (stop + wake), against a
 * real environment. P0 of plans/20260913-sandbox-start-time.md: every row
 * of that plan's table gets a number from here.
 *
 *   bun run measure [--creates 5] [--reopens 5] [--environment <id>] [--no-name] [--keep]
 *
 * Runs the provisioning job in-process, the way a local API does, against
 * DATABASE_URL and the VERCEL_SANDBOX_* variables from the root .env. The
 * environment is the newest unarchived fork environment (a golden) unless
 * --environment names one. Every workspace it creates is deleted at the end,
 * sandbox and row, unless --keep.
 *
 * Three clocks meet in the table: this machine's (the job and the polls),
 * the sandbox's (the boot log stamps) and, for a real create, the desktop's.
 * A stage that spans two clocks is marked with a dagger.
 */
import { db } from "@superset/db/client";
import { cloudWorkspaces, environments } from "@superset/db/schema";
import {
	buildSandboxClaim,
	deleteSandbox,
	HOST_SERVICE_PORT,
	sandboxHostSecretFor,
	waitForStopSnapshot,
	wakeSandbox,
} from "@superset/trpc/lib/sandbox";
import {
	provisionCloudWorkspace,
	sandboxNameFor,
} from "@superset/trpc/router/cloud-workspace/provision";
import { Sandbox } from "@vercel/sandbox";
import { eq } from "drizzle-orm";

process.env.SKIP_ENV_VALIDATION ??= "1";

interface BootStamp {
	phase: string;
	at: number;
}

interface HealthProbe {
	/** This machine's clock when the first 200 arrived. */
	at: number;
	stamps: BootStamp[];
	runtime: { node: string; hostService: string } | null;
}

type Stages = Record<string, number | null>;

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
	const index = args.indexOf(`--${name}`);
	return index === -1 ? undefined : args[index + 1];
}
const CREATES = Number(flag("creates") ?? 5);
const REOPENS = Number(flag("reopens") ?? 5);
const ENVIRONMENT_ID = flag("environment");
const NAME_FROM_MODEL = !args.includes("--no-name");
const KEEP = args.includes("--keep");
const PROBE_INTERVAL_MS = 100;
const PROBE_TIMEOUT_MS = 180_000;

const started = Date.now();
const log = (line: string) =>
	console.log(
		`${((Date.now() - started) / 1000).toFixed(1).padStart(6)}s ${line}`,
	);

function credentials() {
	return {
		token: process.env.VERCEL_SANDBOX_TOKEN ?? "",
		teamId: process.env.VERCEL_SANDBOX_TEAM_ID ?? "",
		projectId: process.env.VERCEL_SANDBOX_PROJECT_ID ?? "",
	};
}

async function pickEnvironment() {
	if (ENVIRONMENT_ID) {
		const row = await db.query.environments.findFirst({
			where: eq(environments.id, ENVIRONMENT_ID),
		});
		if (!row) throw new Error(`environment ${ENVIRONMENT_ID} not found`);
		return row;
	}
	const row = await db.query.environments.findFirst({
		where: (table, { and, eq: equals, isNull }) =>
			and(equals(table.sourceKind, "fork"), isNull(table.archivedAt)),
		orderBy: (table, { desc }) => desc(table.updatedAt),
	});
	if (!row)
		throw new Error("no unarchived fork environment; pass --environment");
	return row;
}

/**
 * Polls health.check every 100 ms until it answers, independent of the API's
 * own wake poll, so the first 200 is placed to within 100 ms.
 */
async function probeUntilHealthy(
	target: string,
	hostSecret: string,
): Promise<HealthProbe> {
	const deadline = Date.now() + PROBE_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const response = await fetch(`${target}/trpc/health.check`, {
			headers: { Authorization: `Bearer ${hostSecret}` },
			signal: AbortSignal.timeout(2_000),
		}).catch(() => null);
		if (response?.ok) {
			const at = Date.now();
			const body = (await response.json()) as {
				result?: {
					data?: {
						json?: {
							sandboxBoot?: {
								stamps: BootStamp[];
								runtime: { node: string; hostService: string };
							};
						};
					};
				};
			};
			const boot = body.result?.data?.json?.sandboxBoot;
			return { at, stamps: boot?.stamps ?? [], runtime: boot?.runtime ?? null };
		}
		await Bun.sleep(PROBE_INTERVAL_MS);
	}
	throw new Error(`host-service at ${target} did not answer in time`);
}

const stampAt = (stamps: BootStamp[], phase: string): number | null =>
	stamps.find((stamp) => stamp.phase === phase)?.at ?? null;
const stampStartingWith = (
	stamps: BootStamp[],
	prefix: string,
): number | null =>
	stamps.find((stamp) => stamp.phase.startsWith(prefix))?.at ?? null;
const delta = (from: number | null, to: number | null): number | null =>
	from === null || to === null ? null : to - from;

/** The boot runner's own phases, on the sandbox's clock. */
function bootStages(stamps: BootStamp[]): Stages {
	const bootStart = stampAt(stamps, "boot.start");
	const hostExec = stampAt(stamps, "host.exec");
	return {
		"boot.start → run.cleared": delta(
			bootStart,
			stampAt(stamps, "run.cleared"),
		),
		"bundle check (or install)": delta(
			stampAt(stamps, "run.cleared"),
			stampStartingWith(stamps, "bundle."),
		),
		"rootfs pass": delta(
			stampAt(stamps, "rootfs.start"),
			stampAt(stamps, "rootfs.end"),
		),
		"assets pass": delta(
			stampAt(stamps, "assets.start"),
			stampAt(stamps, "assets.end"),
		),
		"steps pass": delta(
			stampAt(stamps, "steps.start"),
			stampAt(stamps, "steps.end"),
		),
		"boot.start → host.exec (whole runner)": delta(bootStart, hostExec),
		"host.exec → host.process.start": delta(
			hostExec,
			stampAt(stamps, "host.process.start"),
		),
		"host.process.start → host.listening": delta(
			stampAt(stamps, "host.process.start"),
			stampAt(stamps, "host.listening"),
		),
		"boot.start → host.listening": delta(
			bootStart,
			stampAt(stamps, "host.listening"),
		),
		"boot.start → host.ready (runner's own probe)": delta(
			bootStart,
			stampAt(stamps, "host.ready"),
		),
		"checkout (clone, fetch or skipped)": delta(
			stampAt(stamps, "checkout.start"),
			stampAt(stamps, "checkout.end"),
		),
	};
}

async function measureCreate(
	index: number,
	environment: { id: string; organizationId: string },
): Promise<{ id: string; stages: Stages; probe: HealthProbe }> {
	const id = crypto.randomUUID();
	const providerSandboxId = sandboxNameFor(id);
	log(`create ${index}: ${providerSandboxId}`);
	const createStart = Date.now();
	await db.insert(cloudWorkspaces).values({
		id,
		organizationId: environment.organizationId,
		name: `P0 measure ${index}`,
		branch: "main",
		provider: "vercel",
		providerSandboxId,
		status: "provisioning",
		environmentId: environment.id,
	});
	const rowWritten = Date.now();
	const outcome = await provisionCloudWorkspace({
		cloudWorkspaceId: id,
		...(NAME_FROM_MODEL
			? { namingPrompt: "Measure how long a cloud workspace takes to start" }
			: {}),
	});
	const ready = Date.now();
	if (outcome !== "provisioned")
		throw new Error(`create ${index}: provisioning ${outcome}`);
	const row = await db.query.cloudWorkspaces.findFirst({
		where: eq(cloudWorkspaces.id, id),
	});
	if (!row?.sandboxUrl) throw new Error(`create ${index}: no sandbox url`);
	const hostSecret = await sandboxHostSecretFor(id);
	const probe = await probeUntilHealthy(row.sandboxUrl, hostSecret);
	const ms = (date: Date | null) => date?.getTime() ?? null;
	const stages: Stages = {
		"create: row write": rowWritten - createStart,
		"row written → job start": delta(rowWritten, ms(row.provisionStartedAt)),
		"job: name, clone token, environment, hooks": delta(
			ms(row.provisionStartedAt),
			ms(row.sandboxCreateStartedAt),
		),
		"Sandbox.fork / create": delta(
			ms(row.sandboxCreateStartedAt),
			ms(row.sandboxCreateFinishedAt),
		),
		"identity file + fire boot": delta(
			ms(row.sandboxCreateFinishedAt),
			ms(row.bootFiredAt),
		),
		"boot fired → boot.start †": delta(
			ms(row.bootFiredAt),
			stampAt(probe.stamps, "boot.start"),
		),
		...bootStages(probe.stamps),
		"host.listening → first 200 (100 ms probe) †": delta(
			stampAt(probe.stamps, "host.listening"),
			probe.at,
		),
		"boot fired → first healthy (API's wake) ": delta(
			ms(row.bootFiredAt),
			ms(row.firstHealthyAt),
		),
		"job returned (row ready + env pushed) → first 200": probe.at - ready,
		"create → job returned": ready - createStart,
		"create → first 200": probe.at - createStart,
	};
	log(
		`create ${index}: job returned after ${((ready - createStart) / 1000).toFixed(2)}s (runtime ${probe.runtime?.hostService ?? "?"} on node ${probe.runtime?.node ?? "?"})`,
	);
	return { id, stages, probe };
}

async function measureReopen(index: number, id: string): Promise<Stages> {
	const providerSandboxId = sandboxNameFor(id);
	const sandbox = await Sandbox.get({
		...credentials(),
		name: providerSandboxId,
		resume: false,
	});
	const previousSnapshot = sandbox.currentSnapshotId;
	log(`reopen ${index}: stopping ${providerSandboxId}`);
	await sandbox.stop();
	await waitForStopSnapshot(providerSandboxId, previousSnapshot);
	const target = sandbox.domain(HOST_SERVICE_PORT);
	const row = await db.query.cloudWorkspaces.findFirst({
		where: eq(cloudWorkspaces.id, id),
	});
	if (!row) throw new Error(`reopen ${index}: row gone`);
	const hostSecret = await sandboxHostSecretFor(id);
	log(`reopen ${index}: waking`);
	const wakeStart = Date.now();
	const [probe, wake] = await Promise.all([
		probeUntilHealthy(target, hostSecret),
		buildSandboxClaim({ row })
			.then(({ claim }) => wakeSandbox({ providerSandboxId, claim }))
			.then(() => Date.now()),
	]);
	const stages: Stages = {
		"wake → boot.start (resume + claim + runCommand) †": delta(
			wakeStart,
			stampAt(probe.stamps, "boot.start"),
		),
		...bootStages(probe.stamps),
		"host.listening → first 200 (100 ms probe) †": delta(
			stampAt(probe.stamps, "host.listening"),
			probe.at,
		),
		"wake → first 200 (100 ms probe)": probe.at - wakeStart,
		"wake → wake returned (API, env pushed)": wake - wakeStart,
	};
	log(
		`reopen ${index}: first 200 after ${((probe.at - wakeStart) / 1000).toFixed(2)}s`,
	);
	return stages;
}

function summarize(
	runs: Stages[],
): Array<[string, number | null, number | null, number]> {
	const ordered = [...new Set(runs.flatMap((run) => Object.keys(run)))];
	return ordered.map((name) => {
		const values = runs
			.map((run) => run[name])
			.filter((value): value is number => typeof value === "number")
			.sort((a, b) => a - b);
		if (values.length === 0) return [name, null, null, 0];
		const middle = Math.floor(values.length / 2);
		const median =
			values.length % 2 === 1
				? (values[middle] as number)
				: ((values[middle - 1] as number) + (values[middle] as number)) / 2;
		return [name, median, values[values.length - 1] as number, values.length];
	});
}

function table(title: string, runs: Stages[]): string {
	const seconds = (value: number | null) =>
		value === null ? "—" : `${(value / 1000).toFixed(2)} s`;
	return [
		`### ${title} (n=${runs.length})`,
		"",
		"| Stage | median | max | n |",
		"| --- | --- | --- | --- |",
		...summarize(runs).map(
			([name, median, max, n]) =>
				`| ${name} | ${seconds(median)} | ${seconds(max)} | ${n} |`,
		),
	].join("\n");
}

async function cleanup(ids: string[]): Promise<void> {
	for (const id of ids) {
		const providerSandboxId = sandboxNameFor(id);
		await deleteSandbox(providerSandboxId).catch((error) => {
			log(
				`cleanup: ${providerSandboxId} not deleted: ${String(error).slice(0, 120)}`,
			);
		});
		await db.delete(cloudWorkspaces).where(eq(cloudWorkspaces.id, id));
	}
	log(`cleanup: ${ids.length} workspace(s) deleted`);
}

const environment = await pickEnvironment();
log(
	`environment ${environment.name} (${environment.id}) → ${environment.sourceKind} ${environment.sourceRef}, bundle ${environment.bundleSha?.slice(0, 12) ?? "image's own"}, organization ${environment.organizationId}`,
);

const created: string[] = [];
const createRuns: Stages[] = [];
const reopenRuns: Stages[] = [];
let failure: unknown = null;
try {
	for (let index = 1; index <= CREATES; index++) {
		const run = await measureCreate(index, environment);
		created.push(run.id);
		createRuns.push(run.stages);
	}
	for (let index = 1; index <= REOPENS; index++) {
		const id = created[(index - 1) % created.length];
		if (!id) break;
		reopenRuns.push(await measureReopen(index, id));
	}
} catch (error) {
	failure = error;
	console.error(error);
} finally {
	if (KEEP) log(`kept ${created.length} workspace(s): ${created.join(", ")}`);
	else await cleanup(created);
}

console.log("");
console.log("Stages spanning two clocks are marked †.");
console.log("");
console.log(table("Create", createRuns));
console.log("");
console.log(table("Reopen (stop + wake)", reopenRuns));
process.exit(failure ? 1 : 0);
