import { randomBytes } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import * as p from "@clack/prompts";
import { boolean, CLIError, number, string } from "@superset/cli-framework";
import { command } from "../../lib/command";
import { SUPERSET_CONFIG_PATH } from "../../lib/config";
import { waitForUnresponsiveHost } from "../../lib/host/liveness";
import {
	isProcessAlive,
	readManifest,
	removeManifest,
} from "../../lib/host/manifest";
import {
	describeHostExit,
	type SpawnHostResult,
	spawnHostService,
} from "../../lib/host/spawn";
import { resolveOrganization } from "../../lib/resolve-org";

const SECRET_BYTES = 32;

/**
 * A stable pre-shared secret for a direct-only host. Clients that reach the
 * host over their own tunnel need to know it, so it must survive restarts:
 * read it from `path`, or mint one there (0600) on first start.
 */
function loadOrCreateSecret(path: string): string {
	if (existsSync(path)) {
		const secret = readFileSync(path, "utf-8").trim();
		if (secret.length < SECRET_BYTES) {
			throw new CLIError(
				`Secret in ${path} is too short (need at least ${SECRET_BYTES} characters)`,
			);
		}
		return secret;
	}
	const dir = dirname(path);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
	const secret = randomBytes(SECRET_BYTES).toString("hex");
	writeFileSync(path, `${secret}\n`, { mode: 0o600 });
	chmodSync(path, 0o600);
	return secret;
}

export default command({
	description: "Start the host service",
	options: {
		daemon: boolean().desc("Run in background"),
		port: number().desc("Port to listen on"),
		org: string().desc("Organization to register under (id, slug, or name)"),
		direct: boolean().desc(
			"Direct-only host: register with the cloud but never open the relay tunnel (reachable on loopback only, e.g. through your own SSH tunnel)",
		),
		secretFile: string().desc(
			"File holding the host's pre-shared secret (created with 0600 if missing); keeps the secret stable across restarts",
		),
		corsOrigins: string().desc(
			"Comma-separated browser origins allowed to call this host directly (a dev desktop needs its Vite origin)",
		),
	},
	run: async ({ ctx, options, signal }) => {
		const orgs = await ctx.api.user.myOrganizations.query();
		const organization = await resolveOrganization(
			orgs,
			options.org ?? process.env.SUPERSET_ORGANIZATION_ID,
		);

		const existing = readManifest(organization.id);
		if (existing && isProcessAlive(existing.pid)) {
			return {
				data: { pid: existing.pid, endpoint: existing.endpoint },
				message: `Host service already running for ${organization.name} (pid ${existing.pid})`,
			};
		}

		const secret = options.secretFile
			? loadOrCreateSecret(options.secretFile)
			: undefined;
		const corsOrigins = options.corsOrigins
			?.split(",")
			.map((origin) => origin.trim())
			.filter(Boolean);

		p.intro(`superset start (${organization.name})`);
		const spinner = p.spinner();
		spinner.start("Starting host service...");

		let running: SpawnHostResult;
		try {
			const result = await spawnHostService({
				organizationId: organization.id,
				sessionToken: ctx.bearer,
				authConfigPath:
					ctx.authSource === "oauth" ? SUPERSET_CONFIG_PATH : undefined,
				api: ctx.api,
				port: options.port,
				daemon: options.daemon ?? false,
				secret,
				relay: !options.direct,
				corsOrigins,
			});

			spinner.stop(
				`Host service running on port ${result.port} (pid ${result.pid})`,
			);
			if (options.direct) {
				p.log.info(
					"Direct-only host: registered with the cloud, relay tunnel disabled. Reach it at http://127.0.0.1:<port> through your own tunnel.",
				);
			} else {
				p.log.info("Connected to relay — machine is now accessible.");
			}

			if (options.daemon) {
				p.outro("Running in background.");
				return {
					data: {
						pid: result.pid,
						port: result.port,
						organizationId: organization.id,
					},
					message: `Host service started for ${organization.name}`,
				};
			}

			p.outro("Press Ctrl+C to stop.");

			running = result;
		} catch (error) {
			spinner.stop("Failed to start host service");
			throw new CLIError(
				error instanceof Error ? error.message : "Unknown error",
			);
		}

		const stopWatching = new AbortController();
		signal.addEventListener("abort", () => stopWatching.abort(), {
			once: true,
		});
		const failure = await Promise.race([
			running.exited.then(
				(exit) => `exited unexpectedly (${describeHostExit(exit)})`,
			),
			waitForUnresponsiveHost({
				endpoint: `http://127.0.0.1:${running.port}`,
				authToken: running.secret,
				signal: stopWatching.signal,
			}).then((unresponsive) =>
				unresponsive ? "stopped answering health checks" : null,
			),
		]);
		stopWatching.abort();

		if (failure && !signal.aborted) {
			// A wedged event loop never runs a SIGTERM handler.
			if (isProcessAlive(running.pid)) process.kill(running.pid, "SIGKILL");
			if (readManifest(organization.id)?.pid === running.pid) {
				removeManifest(organization.id);
			}
			throw new CLIError(
				`Host service ${failure}`,
				"Run it under a supervisor that restarts on failure, e.g. systemd with Restart=on-failure.",
			);
		}

		return {
			data: {
				pid: running.pid,
				port: running.port,
				organizationId: organization.id,
			},
			message: "Host service stopped",
		};
	},
});
