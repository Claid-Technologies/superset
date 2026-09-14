/**
 * What the desktop saw while opening a cloud workspace, on its own clock:
 * the create it sent (absent on a reopen), the route mounting, the row
 * turning `ready`, the sandbox answering the wake, the first host-service
 * response and the first terminal attaching.
 */
export interface CloudWorkspaceOpenTimeline {
	workspaceId: string;
	kind: "create" | "reopen";
	createStartedAt: number | null;
	openedAt: number;
	readyAt: number | null;
	accessAt: number | null;
	firstResponseAt: number | null;
	firstTerminalAt: number | null;
}

/** The job-side stamps the API wrote on the row, on its clock. */
export interface CloudWorkspaceJobStamps {
	createdAt: Date | string;
	provisionStartedAt: Date | string | null;
	sandboxCreateStartedAt: Date | string | null;
	sandboxCreateFinishedAt: Date | string | null;
	bootFiredAt: Date | string | null;
	firstHealthyAt: Date | string | null;
}

export const CLOUD_WORKSPACE_OPENED_EVENT = "cloud_workspace_opened";

function between(
	from: number | Date | string | null | undefined,
	to: number | Date | string | null | undefined,
): number | null {
	if (from == null || to == null) return null;
	const start = typeof from === "number" ? from : new Date(from).getTime();
	const end = typeof to === "number" ? to : new Date(to).getTime();
	if (Number.isNaN(start) || Number.isNaN(end)) return null;
	return Math.max(0, Math.round(end - start));
}

export function cloudWorkspaceOpenedProperties(
	timeline: CloudWorkspaceOpenTimeline,
	job?: CloudWorkspaceJobStamps,
): Record<string, string | number | null> {
	return {
		workspace_id: timeline.workspaceId,
		kind: timeline.kind,
		create_to_ready_ms: between(timeline.createStartedAt, timeline.readyAt),
		ready_to_access_ms: between(timeline.readyAt, timeline.accessAt),
		ready_to_first_200_ms: between(timeline.readyAt, timeline.firstResponseAt),
		ready_to_first_terminal_ms: between(
			timeline.readyAt,
			timeline.firstTerminalAt,
		),
		open_to_first_200_ms: between(timeline.openedAt, timeline.firstResponseAt),
		server_create_to_job_start_ms: between(
			job?.createdAt,
			job?.provisionStartedAt,
		),
		server_job_start_to_sandbox_create_ms: between(
			job?.provisionStartedAt,
			job?.sandboxCreateStartedAt,
		),
		server_sandbox_create_ms: between(
			job?.sandboxCreateStartedAt,
			job?.sandboxCreateFinishedAt,
		),
		server_sandbox_create_to_boot_fired_ms: between(
			job?.sandboxCreateFinishedAt,
			job?.bootFiredAt,
		),
		server_boot_fired_to_first_healthy_ms: between(
			job?.bootFiredAt,
			job?.firstHealthyAt,
		),
	};
}

/**
 * The create mutation's start, keyed by the id it returned: the route that
 * opens the workspace reads it once to know this open is a create and when it
 * began. Anything not claimed is a create whose route never mounted.
 */
const createStarts = new Map<string, number>();

export function recordCloudWorkspaceCreateStart(
	workspaceId: string,
	startedAt: number,
): void {
	createStarts.set(workspaceId, startedAt);
}

export function takeCloudWorkspaceCreateStart(
	workspaceId: string,
): number | null {
	const startedAt = createStarts.get(workspaceId) ?? null;
	createStarts.delete(workspaceId);
	return startedAt;
}
