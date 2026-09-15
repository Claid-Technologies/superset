import { z } from "zod";
import type { McpContext } from "./auth";
import { createMcpCaller } from "./caller";
import type { HostServiceCallOptions } from "./host-service-client";

/** Where a workspace-scoped tool reaches: a host by id, or a cloud workspace. */
export const workspaceLocationInput = {
	hostId: z
		.string()
		.min(1)
		.optional()
		.describe(
			"Host machineId the workspace lives on. Omit when `cloud` is true.",
		),
	cloud: z
		.boolean()
		.optional()
		.describe(
			"The workspace is a cloud workspace (from cloud_workspaces_list); pass instead of hostId.",
		),
};

/**
 * A cloud workspace is reached by waking its sandbox and presenting a gate
 * ticket, so that happens only when the caller says the workspace is one.
 */
export async function workspaceServiceTarget(
	input: { hostId?: string; cloud?: boolean; workspaceId: string },
	ctx: McpContext,
): Promise<HostServiceCallOptions> {
	if (input.cloud) {
		if (input.hostId) {
			throw new Error(
				"Pass hostId or cloud, not both: a cloud workspace has no host",
			);
		}
		const access = await createMcpCaller(ctx).cloudWorkspace.access({
			id: input.workspaceId,
			wake: true,
		});
		return {
			gateUrl: access.url,
			ticket: access.token,
			workspaceId: input.workspaceId,
		};
	}
	if (!input.hostId) {
		throw new Error(
			"hostId is required unless cloud is true. Find it with hosts_list / workspaces_list",
		);
	}
	return {
		relayUrl: ctx.relayUrl,
		organizationId: ctx.organizationId,
		hostId: input.hostId,
		jwt: ctx.bearerToken,
	};
}
