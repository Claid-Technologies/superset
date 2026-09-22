import type { SelectPageComment } from "@superset/db/schema";
import { watchState } from "../page/watch";

export interface WaitingThreadRow {
	workspaceId: string;
	agentActivatedAt: Date | null;
	resolvedAt: Date | null;
	lastAuthorKind: SelectPageComment["authorKind"] | null;
	watchedByAgent: string | null;
	watchHeartbeatAt: Date | null;
}

export interface WorkspaceWaitingCount {
	workspaceId: string;
	waitingCount: number;
}

export function isWaitingOnAgent(
	thread: Omit<WaitingThreadRow, "workspaceId">,
	now: number,
): boolean {
	return (
		thread.agentActivatedAt !== null &&
		thread.resolvedAt === null &&
		thread.lastAuthorKind === "human" &&
		watchState(thread, now).watching
	);
}

export function countWaitingByWorkspace(
	rows: WaitingThreadRow[],
	now: number,
): WorkspaceWaitingCount[] {
	const counts = new Map<string, number>();
	for (const row of rows) {
		if (!isWaitingOnAgent(row, now)) continue;
		counts.set(row.workspaceId, (counts.get(row.workspaceId) ?? 0) + 1);
	}
	return [...counts].map(([workspaceId, waitingCount]) => ({
		workspaceId,
		waitingCount,
	}));
}
