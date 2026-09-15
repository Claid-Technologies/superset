import { CLIError } from "@superset/cli-framework";
import {
	type ResolvedHostTarget,
	resolveCloudWorkspaceTarget,
	resolveHostFilter,
	resolveHostTarget,
} from "../host-target";
import {
	type HostWorkspaceRow,
	type HostWorkspacesOptions,
	listWorkspacesOnHost,
} from "./workspacesOnHost";

export interface ResolvedWorkspaceTarget {
	hostId: string;
	workspace: HostWorkspaceRow;
	target: ResolvedHostTarget;
}

/**
 * Where a workspace lives and a client for it: a cloud workspace unless
 * `--local` or `--host` names a host. Never guessed from the id.
 */
export async function resolveWorkspaceTarget(
	options: Omit<HostWorkspacesOptions, "hostId"> & {
		host?: string;
		local?: boolean;
	},
	workspaceId: string,
): Promise<ResolvedWorkspaceTarget> {
	const hostId = resolveHostFilter({
		host: options.host,
		local: options.local,
	});
	return hostId
		? onHost(options, hostId, workspaceId)
		: inCloud(options, workspaceId);
}

async function onHost(
	options: Omit<HostWorkspacesOptions, "hostId">,
	hostId: string,
	workspaceId: string,
): Promise<ResolvedWorkspaceTarget> {
	const { workspaces } = await listWorkspacesOnHost({ ...options, hostId });
	const workspace = workspaces.find((row) => row.id === workspaceId);
	if (!workspace) {
		throw new CLIError(
			`Workspace not found on host ${hostId}: ${workspaceId}`,
			"Pass --host <id> if it lives on another machine, or drop --local/--host for a cloud workspace",
		);
	}
	const target = await resolveHostTarget({
		requestedHostId: hostId,
		organizationId: options.organizationId,
		userJwt: options.userJwt,
		api: options.api,
	});
	return { hostId, workspace, target };
}

async function inCloud(
	options: Omit<HostWorkspacesOptions, "hostId">,
	workspaceId: string,
): Promise<ResolvedWorkspaceTarget> {
	const rows = await options.api.cloudWorkspace.list.query({
		organizationId: options.organizationId,
	});
	const row = rows.find((candidate) => candidate.id === workspaceId);
	if (!row) {
		throw new CLIError(
			`No cloud workspace ${workspaceId} in this organization`,
			"Pass --local for a workspace on this machine, or --host <id> for another host",
		);
	}
	if (row.status !== "ready") {
		throw new CLIError(
			`Cloud workspace ${workspaceId} is ${row.status}`,
			row.status === "provisioning"
				? "Its sandbox is still being created; try again shortly"
				: "Check it with: superset workspaces list",
		);
	}
	const target = await resolveCloudWorkspaceTarget({
		api: options.api,
		workspaceId,
	});
	const workspace = (await target.client.workspace.list.query()).find(
		(candidate) => candidate.id === workspaceId,
	);
	if (!workspace) {
		throw new CLIError(
			`Cloud workspace ${workspaceId} has not finished setting up`,
			"Its checkout is still arriving; try again shortly",
		);
	}
	return {
		hostId: workspace.hostId,
		// host-service names its row a placeholder; the API owns the name.
		workspace: { ...workspace, name: row.name },
		target: { ...target, hostId: workspace.hostId },
	};
}
