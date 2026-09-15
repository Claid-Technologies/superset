import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CLOUD_AGENT_IDS } from "@superset/shared/cloud-agent-launch";
import {
	selectCloudEnvironment,
	startableCloudEnvironments,
} from "@superset/shared/cloud-environments";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "cloud_workspaces_create",
		annotations: { destructiveHint: false },
		description:
			"Provision a cloud sandbox: a workspace that runs on Superset's infrastructure instead of one of the user's machines, so it keeps running when their laptop sleeps. It starts from an environment and clones that environment's repositories — there is no projectId, host or worktree, so do not call hosts_list or projects_list first. Returns as soon as the row exists, in status 'provisioning'; poll cloud_workspaces_list until it is 'ready'. A sandbox bills until it is deleted, so call cloud_workspaces_delete when the work is done.",
		inputSchema: {
			prompt: z
				.string()
				.min(1)
				.max(20_000)
				.describe(
					"Prompt the agent starts with. Also names the workspace when `name` is omitted.",
				),
			agent: z
				.enum(CLOUD_AGENT_IDS as [string, ...string[]])
				.optional()
				.describe(
					"Built-in agent to launch on first boot. Only these run in a sandbox. Omit for a sandbox that comes up idle.",
				),
			name: z
				.string()
				.min(1)
				.max(200)
				.optional()
				.describe("Workspace name. Omit to have it named from the prompt."),
			branch: z
				.string()
				.min(1)
				.max(300)
				.optional()
				.describe("Branch to check out. Defaults to the repository default."),
			environment: z
				.string()
				.min(1)
				.optional()
				.describe(
					"Environment the workspace starts from, by id or name; its repositories are the checkouts. Defaults to the first environment with repositories.",
				),
			model: z
				.string()
				.min(1)
				.optional()
				.describe("Model for the launched agent. Omit for the agent default."),
			effort: z
				.string()
				.min(1)
				.optional()
				.describe(
					"Reasoning effort for the launched agent. Omit for the agent default.",
				),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			const environments = await caller.environment.list({
				organizationId: ctx.organizationId,
			});
			const startable = startableCloudEnvironments(environments);
			const environment = selectCloudEnvironment(
				environments,
				input.environment,
			);
			if (!environment || !startable.includes(environment)) {
				throw new Error(
					startable.length === 0
						? "No environment with repositories in this organization. Create one in Settings → Environments."
						: `${environment ? `Environment "${environment.name}" has no repositories` : `No environment "${input.environment}"`}. Start from one of: ${startable.map((row) => row.name).join(", ")}`,
				);
			}

			return caller.cloudWorkspace.create({
				organizationId: ctx.organizationId,
				environmentId: environment.id,
				prompt: input.prompt,
				...(input.agent ? { agent: input.agent } : {}),
				...(input.name ? { name: input.name } : {}),
				...(input.branch ? { branch: input.branch } : {}),
				...(input.model ? { model: input.model } : {}),
				...(input.effort ? { effort: input.effort } : {}),
			});
		},
	});
}
