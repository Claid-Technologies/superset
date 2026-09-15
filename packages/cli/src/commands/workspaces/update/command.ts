import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostFilter, resolveHostTarget } from "../../../lib/host-target";

export default command({
	description:
		"Update a cloud workspace, or a workspace on this machine with --local or another host with --host",
	args: [positional("id").required().desc("Workspace UUID")],
	options: {
		host: string().desc("Host the workspace lives on (default: the cloud)"),
		local: boolean().desc("The workspace is on this machine"),
		name: string().desc("Workspace name"),
		taskId: string().desc("Link the workspace to a task by id"),
		clearTask: boolean().desc("Unlink the workspace from its current task"),
		tag: string()
			.variadic()
			.desc(
				"Replace the workspace's tag set. Repeatable. Each tag files the workspace into a sidebar folder of the same name",
			),
		clearTags: boolean().desc("Remove every tag from the workspace"),
	},
	run: async ({ ctx, args, options }) => {
		const id = args.id as string;
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		if (options.taskId !== undefined && options.clearTask) {
			throw new CLIError(
				"Cannot combine --task-id and --clear-task",
				"Pass one or the other",
			);
		}
		if (options.tag?.length && options.clearTags) {
			throw new CLIError(
				"Cannot combine --tag and --clear-tags",
				"Pass one or the other",
			);
		}

		const taskId = options.clearTask
			? null
			: options.taskId !== undefined
				? options.taskId
				: undefined;

		// --tag replaces the whole set (the host semantic); --clear-tags is [].
		const tags = options.clearTags
			? []
			: options.tag?.length
				? options.tag
				: undefined;

		if (
			options.name === undefined &&
			taskId === undefined &&
			tags === undefined
		) {
			throw new CLIError(
				"No fields to update",
				"Pass --name, --task-id, --clear-task, --tag, or --clear-tags",
			);
		}

		const hostId = resolveHostFilter({
			host: options.host ?? undefined,
			local: options.local ?? undefined,
		});
		if (!hostId) {
			// A cloud workspace's name lives in the API; tasks and tags are
			// host-side rows it does not have.
			if (taskId !== undefined || tags !== undefined) {
				throw new CLIError(
					"Only --name applies to a cloud workspace",
					"Pass --local or --host <id> to update tasks or tags on a host workspace",
				);
			}
			const renamed = await ctx.api.cloudWorkspace.rename.mutate({
				id,
				name: options.name as string,
			});
			return {
				data: renamed,
				message: `Renamed cloud workspace ${id}`,
			};
		}

		const target = await resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
			api: ctx.api,
		});
		const updated = await target.client.workspace.update.mutate({
			id,
			...(options.name !== undefined ? { name: options.name } : {}),
			...(taskId !== undefined ? { taskId } : {}),
			...(tags !== undefined ? { tags } : {}),
		});

		return {
			data: updated,
			message: `Updated workspace ${id}`,
		};
	},
});
