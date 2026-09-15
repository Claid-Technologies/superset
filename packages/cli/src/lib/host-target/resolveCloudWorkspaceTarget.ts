import { CLIError } from "@superset/cli-framework";
import type { AppRouter as HostServiceRouter } from "@superset/host-service/trpc";
import { getHostId } from "@superset/shared/host-info";
import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import SuperJSON from "superjson";
import type { ApiClient } from "../api-client";
import type { ResolvedHostTarget } from "./resolveHostTarget";

/**
 * host-service inside a cloud workspace's sandbox. The API wakes the sandbox
 * and mints a ticket; the gate admits the ticket and presents the box's own
 * secret, so the client below talks to the box like any other host.
 */
export async function resolveCloudWorkspaceTarget(options: {
	api: ApiClient;
	workspaceId: string;
}): Promise<ResolvedHostTarget> {
	let access: { url: string; token: string };
	try {
		access = await options.api.cloudWorkspace.access.mutate({
			id: options.workspaceId,
			wake: true,
		});
	} catch (error) {
		if (error instanceof TRPCClientError) {
			throw new CLIError(
				`Cloud workspace ${options.workspaceId}: ${error.message}`,
				error.data?.code === "TIMEOUT"
					? "The sandbox is still starting; try again in a few seconds"
					: "Check it with: superset workspaces list --cloud",
			);
		}
		throw error;
	}
	return {
		kind: "cloud",
		hostId: `cloud:${options.workspaceId}`,
		client: createTRPCClient<HostServiceRouter>({
			links: [
				httpBatchLink({
					url: `${access.url}/trpc`,
					transformer: SuperJSON,
					headers: {
						Authorization: `Bearer ${access.token}`,
						"x-superset-client-machine-id": getHostId(),
					},
				}),
			],
		}),
		ws: {
			baseWsUrl: access.url.replace(/^http/, "ws"),
			token: access.token,
		},
	};
}
