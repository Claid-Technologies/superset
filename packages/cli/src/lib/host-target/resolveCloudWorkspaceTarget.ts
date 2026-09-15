import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CLIError } from "@superset/cli-framework";
import type { AppRouter as HostServiceRouter } from "@superset/host-service/trpc";
import { getHostId } from "@superset/shared/host-info";
import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import SuperJSON from "superjson";
import type { ApiClient } from "../api-client";
import { SUPERSET_HOME_DIR } from "../config";
import type {
	HostServiceClient,
	ResolvedHostTarget,
} from "./resolveHostTarget";

type HostWorkspaceRows = Awaited<
	ReturnType<HostServiceClient["workspace"]["list"]["query"]>
>;

interface Ticket {
	url: string;
	token: string;
	expiresAt: number;
}

const TICKETS_PATH = join(SUPERSET_HOME_DIR, "cloud-workspace-tickets.json");
const TICKET_MARGIN_MS = 60_000;
/** A stopped sandbox behind a cached ticket should fail over to a wake, not hang. */
const REACH_TIMEOUT_MS = 8_000;

/**
 * host-service inside a cloud workspace's sandbox, reached through the gate
 * with a ticket. The box answers in tens of milliseconds; asking the API to
 * wake it costs seconds, so the ticket from the last call is tried first,
 * then a ticket minted without a wake, and only then a wake — for a stopped
 * sandbox, or one whose address moved since the ticket was minted.
 */
export async function resolveCloudWorkspaceTarget(options: {
	api: ApiClient;
	organizationId: string;
	workspaceId: string;
}): Promise<{ target: ResolvedHostTarget; workspaces: HostWorkspaceRows }> {
	const key = `${options.organizationId}:${options.workspaceId}`;

	const cached = readTickets()[key];
	if (cached && cached.expiresAt - TICKET_MARGIN_MS > Date.now()) {
		const reached = await reach(options.workspaceId, cached);
		if (reached) return reached;
	}

	const described = await mint(options, false);
	if (described.running) {
		const reached = await reach(options.workspaceId, described);
		if (reached) {
			saveTicket(key, described);
			return reached;
		}
	}

	const woken = await mint(options, true);
	const target = targetFor(options.workspaceId, woken);
	const workspaces = await target.client.workspace.list.query();
	saveTicket(key, woken);
	return { target, workspaces };
}

async function reach(
	workspaceId: string,
	ticket: Ticket,
): Promise<{
	target: ResolvedHostTarget;
	workspaces: HostWorkspaceRows;
} | null> {
	const target = targetFor(workspaceId, ticket);
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const workspaces = await Promise.race([
			target.client.workspace.list.query(),
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new Error("no answer")),
					REACH_TIMEOUT_MS,
				);
			}),
		]);
		return { target, workspaces };
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

async function mint(
	options: { api: ApiClient; workspaceId: string },
	wake: boolean,
): Promise<Ticket & { running: boolean }> {
	try {
		const access = await options.api.cloudWorkspace.access.mutate({
			id: options.workspaceId,
			wake,
		});
		return {
			url: access.url,
			token: access.token,
			expiresAt: new Date(access.expiresAt).getTime(),
			running: access.running,
		};
	} catch (error) {
		if (!(error instanceof TRPCClientError)) throw error;
		const code = error.data?.code;
		if (code === "NOT_FOUND") {
			throw new CLIError(
				`No cloud workspace ${options.workspaceId} in this organization`,
				"Pass --local for a workspace on this machine, or --host <id> for another host",
			);
		}
		throw new CLIError(
			`Cloud workspace ${options.workspaceId}: ${error.message}`,
			code === "TIMEOUT"
				? "The sandbox is still starting; try again in a few seconds"
				: "Check it with: superset workspaces list",
		);
	}
}

function targetFor(workspaceId: string, ticket: Ticket): ResolvedHostTarget {
	return {
		kind: "cloud",
		hostId: `cloud:${workspaceId}`,
		client: createTRPCClient<HostServiceRouter>({
			links: [
				httpBatchLink({
					url: `${ticket.url}/trpc`,
					transformer: SuperJSON,
					headers: {
						Authorization: `Bearer ${ticket.token}`,
						"x-superset-client-machine-id": getHostId(),
					},
				}),
			],
		}),
		ws: {
			baseWsUrl: ticket.url.replace(/^http/, "ws"),
			token: ticket.token,
		},
	};
}

function readTickets(): Record<string, Ticket> {
	if (!existsSync(TICKETS_PATH)) return {};
	try {
		return JSON.parse(readFileSync(TICKETS_PATH, "utf8"));
	} catch {
		return {};
	}
}

function saveTicket(key: string, ticket: Ticket): void {
	const now = Date.now();
	const kept = Object.fromEntries(
		Object.entries(readTickets()).filter(([, entry]) => entry.expiresAt > now),
	);
	kept[key] = {
		url: ticket.url,
		token: ticket.token,
		expiresAt: ticket.expiresAt,
	};
	try {
		writeFileSync(TICKETS_PATH, JSON.stringify(kept), { mode: 0o600 });
		chmodSync(TICKETS_PATH, 0o600);
	} catch {
		// A ticket that cannot be cached is minted again next call.
	}
}
