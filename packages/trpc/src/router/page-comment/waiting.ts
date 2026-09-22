import type { SelectPageComment } from "@superset/db/schema";

export interface WaitingThreadRow {
	workspaceId: string;
	agentActivatedAt: Date | null;
	resolvedAt: Date | null;
	lastAuthorKind: SelectPageComment["authorKind"] | null;
}

export interface WorkspaceWaitingCount {
	workspaceId: string;
	waitingCount: number;
}

export function isWaitingOnAgent(
	thread: Omit<WaitingThreadRow, "workspaceId">,
): boolean {
	return (
		thread.agentActivatedAt !== null &&
		thread.resolvedAt === null &&
		thread.lastAuthorKind === "human"
	);
}

export function countWaitingByWorkspace(
	rows: WaitingThreadRow[],
): WorkspaceWaitingCount[] {
	const counts = new Map<string, number>();
	for (const row of rows) {
		if (!isWaitingOnAgent(row)) continue;
		counts.set(row.workspaceId, (counts.get(row.workspaceId) ?? 0) + 1);
	}
	return [...counts].map(([workspaceId, waitingCount]) => ({
		workspaceId,
		waitingCount,
	}));
}
