import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "workspaces_list",
		annotations: { readOnlyHint: true },
		description:
			"List workspaces. Without hostId, the organization's cloud workspaces with their status ('provisioning', 'ready', 'failed') — use it to watch one created by workspaces_create reach 'ready'. With hostId, the workspaces on that host (see hosts_list), including the host-served projectName; use this to find a workspace ID for automations_create's v2WorkspaceId.",
		inputSchema: {
			hostId: z
				.string()
				.min(1)
				.optional()
				.describe(
					"Host machineId to query (see `hosts_list`). Omit to list cloud workspaces.",
				),
		},
		handler: async (input, ctx) => {
			if (!input.hostId) {
				return createMcpCaller(ctx).cloudWorkspace.list({
					organizationId: ctx.organizationId,
				});
			}
			return hostServiceCall(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: input.hostId,
					jwt: ctx.bearerToken,
				},
				"workspace.list",
				"query",
			);
		},
	});
}
