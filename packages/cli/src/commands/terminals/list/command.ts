import { boolean, CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveWorkspaceTarget } from "../../../lib/host-workspaces";

export default command({
	description: "List the live terminal sessions in a workspace",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc("Host the workspace lives on (default: this machine)"),
		cloud: boolean().desc("The workspace is a cloud workspace"),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const { target } = await resolveWorkspaceTarget(
			{
				organizationId,
				userJwt: ctx.bearer,
				api: ctx.api,
				hostId: options.host ?? undefined,
				cloud: options.cloud ?? false,
			},
			options.workspace,
		);

		const result = await target.client.terminal.list.query({
			workspaceId: options.workspace,
		});

		return {
			data: result,
			message: `${result.sessions.length} terminal(s) in workspace ${options.workspace}`,
		};
	},
});
