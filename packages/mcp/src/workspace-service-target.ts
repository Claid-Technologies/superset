import { z } from "zod";
import type { McpContext } from "./auth";
import { createMcpCaller } from "./caller";
import type { HostServiceCallOptions } from "./host-service-client";

/** Where a workspace-scoped tool reaches: a cloud workspace unless a host is named. */
export const workspaceLocationInput = {
	hostId: z
		.string()
		.min(1)
		.optional()
		.describe(
			"Host machineId the workspace lives on. Omit for a cloud workspace (the default).",
		),
};

/**
 * A cloud workspace is reached through its sandbox gate with a ticket, waking
 * the sandbox only when it is stopped; a host workspace through the relay.
 */
export async function workspaceServiceTarget(
	input: { hostId?: string; workspaceId: string },
	ctx: McpContext,
): Promise<HostServiceCallOptions> {
	if (!input.hostId) {
		// Waking re-runs the whole open sequence and costs seconds; a running
		// sandbox only needs its address and a ticket.
		const caller = createMcpCaller(ctx);
		const described = await caller.cloudWorkspace.access({
			id: input.workspaceId,
			wake: false,
		});
		const access = described.running
			? described
			: await caller.cloudWorkspace.access({
					id: input.workspaceId,
					wake: true,
				});
		return {
			gateUrl: access.url,
			ticket: access.token,
			workspaceId: input.workspaceId,
		};
	}
	return {
		relayUrl: ctx.relayUrl,
		organizationId: ctx.organizationId,
		hostId: input.hostId,
		jwt: ctx.bearerToken,
	};
}
