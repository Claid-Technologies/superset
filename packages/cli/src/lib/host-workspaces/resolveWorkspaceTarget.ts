import { CLIError } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import {
	type ResolvedHostTarget,
	resolveCloudWorkspaceTarget,
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
 * Where a workspace lives and a client for it: a cloud workspace with
 * `cloud`, the `hostId` host when given, else this machine. Never guessed: a
 * cloud lookup wakes a sandbox, so it happens only when asked for.
 */
export async function resolveWorkspaceTarget(
	options: HostWorkspacesOptions & { cloud?: boolean },
	workspaceId: string,
): Promise<ResolvedWorkspaceTarget> {
	if (options.cloud) {
		if (options.hostId) {
			throw new CLIError(
				"--cloud and --host are exclusive",
				"A cloud workspace runs in its own sandbox, not on a host",
			);
		}
		return inCloud(options, workspaceId);
	}
	return onHost(options, options.hostId ?? getHostId(), workspaceId);
}

async function onHost(
	options: HostWorkspacesOptions,
	hostId: string,
	workspaceId: string,
): Promise<ResolvedWorkspaceTarget> {
	const { workspaces } = await listWorkspacesOnHost({ ...options, hostId });
	const workspace = workspaces.find((row) => row.id === workspaceId);
	if (!workspace) {
		throw new CLIError(
			`Workspace not found on host ${hostId}: ${workspaceId}`,
			"Pass --host <id> if it lives on another machine, or --cloud for a cloud workspace",
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
	options: HostWorkspacesOptions,
	workspaceId: string,
): Promise<ResolvedWorkspaceTarget> {
	const rows = await options.api.cloudWorkspace.list.query({
		organizationId: options.organizationId,
	});
	const row = rows.find((candidate) => candidate.id === workspaceId);
	if (!row) {
		throw new CLIError(
			`No cloud workspace ${workspaceId} in this organization`,
			"List them with: superset workspaces list --cloud",
		);
	}
	if (row.status !== "ready") {
		throw new CLIError(
			`Cloud workspace ${workspaceId} is ${row.status}`,
			row.status === "provisioning"
				? "Its sandbox is still being created; try again shortly"
				: "Check it with: superset workspaces list --cloud",
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
