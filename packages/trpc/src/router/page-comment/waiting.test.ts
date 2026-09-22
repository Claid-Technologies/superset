import { describe, expect, it } from "bun:test";
import { WATCH_STALE_MS } from "../page/watch";
import {
	countWaitingByWorkspace,
	isWaitingOnAgent,
	type WaitingThreadRow,
} from "./waiting";

const activated = new Date("2026-09-01T00:00:00Z");
const now = new Date("2026-09-01T12:00:00Z").getTime();

function thread(
	overrides: Partial<Omit<WaitingThreadRow, "workspaceId">> = {},
): Omit<WaitingThreadRow, "workspaceId"> {
	return {
		agentActivatedAt: activated,
		resolvedAt: null,
		lastAuthorKind: "human",
		watchedByAgent: "claude",
		watchHeartbeatAt: new Date(now),
		...overrides,
	};
}

describe("isWaitingOnAgent", () => {
	it("waits when an activated, unresolved, watched thread ends on a human", () => {
		expect(isWaitingOnAgent(thread(), now)).toBe(true);
	});

	it("does not wait when no agent has been activated on the thread", () => {
		expect(isWaitingOnAgent(thread({ agentActivatedAt: null }), now)).toBe(
			false,
		);
	});

	it("does not wait once the thread is resolved", () => {
		expect(isWaitingOnAgent(thread({ resolvedAt: new Date() }), now)).toBe(
			false,
		);
	});

	it("does not wait while the agent's reply is the last word", () => {
		expect(isWaitingOnAgent(thread({ lastAuthorKind: "agent" }), now)).toBe(
			false,
		);
	});

	it("waits again when a human follows up after an agent reply", () => {
		expect(isWaitingOnAgent(thread({ lastAuthorKind: "human" }), now)).toBe(
			true,
		);
	});

	it("does not wait when every comment on the thread was deleted", () => {
		expect(isWaitingOnAgent(thread({ lastAuthorKind: null }), now)).toBe(false);
	});

	it("does not wait when the page was never watched", () => {
		expect(
			isWaitingOnAgent(
				thread({ watchedByAgent: null, watchHeartbeatAt: null }),
				now,
			),
		).toBe(false);
	});

	it("stops waiting once the watcher's heartbeat goes stale", () => {
		const watched = thread({
			watchHeartbeatAt: new Date(now - WATCH_STALE_MS + 1_000),
		});

		expect(isWaitingOnAgent(watched, now)).toBe(true);
		expect(isWaitingOnAgent(watched, now + 2_000)).toBe(false);
	});

	it("keeps waiting while the heartbeat stays inside the stale window", () => {
		expect(
			isWaitingOnAgent(
				thread({ watchHeartbeatAt: new Date(now - WATCH_STALE_MS + 1) }),
				now,
			),
		).toBe(true);
	});
});

describe("countWaitingByWorkspace", () => {
	it("returns nothing when no thread is waiting", () => {
		expect(
			countWaitingByWorkspace(
				[
					{ workspaceId: "w1", ...thread({ lastAuthorKind: "agent" }) },
					{ workspaceId: "w2", ...thread({ resolvedAt: activated }) },
				],
				now,
			),
		).toEqual([]);
	});

	it("counts waiting threads per workspace and drops the rest", () => {
		expect(
			countWaitingByWorkspace(
				[
					{ workspaceId: "w1", ...thread() },
					{ workspaceId: "w1", ...thread() },
					{ workspaceId: "w1", ...thread({ lastAuthorKind: "agent" }) },
					{ workspaceId: "w2", ...thread() },
					{ workspaceId: "w3", ...thread({ agentActivatedAt: null }) },
				],
				now,
			),
		).toEqual([
			{ workspaceId: "w1", waitingCount: 2 },
			{ workspaceId: "w2", waitingCount: 1 },
		]);
	});

	it("counts one page linked to two workspaces against both", () => {
		expect(
			countWaitingByWorkspace(
				[
					{ workspaceId: "w1", ...thread() },
					{ workspaceId: "w2", ...thread() },
				],
				now,
			),
		).toEqual([
			{ workspaceId: "w1", waitingCount: 1 },
			{ workspaceId: "w2", waitingCount: 1 },
		]);
	});

	it("drops a workspace entirely once its watcher stops heartbeating", () => {
		const rows: WaitingThreadRow[] = [
			{ workspaceId: "w1", ...thread() },
			{ workspaceId: "w1", ...thread() },
		];

		expect(countWaitingByWorkspace(rows, now)).toEqual([
			{ workspaceId: "w1", waitingCount: 2 },
		]);
		expect(countWaitingByWorkspace(rows, now + WATCH_STALE_MS)).toEqual([]);
	});

	it("counts only the workspaces whose pages are still watched", () => {
		expect(
			countWaitingByWorkspace(
				[
					{ workspaceId: "w1", ...thread() },
					{
						workspaceId: "w2",
						...thread({
							watchHeartbeatAt: new Date(now - WATCH_STALE_MS),
						}),
					},
				],
				now,
			),
		).toEqual([{ workspaceId: "w1", waitingCount: 1 }]);
	});
});
