import { describe, expect, it } from "bun:test";
import {
	countWaitingByWorkspace,
	isWaitingOnAgent,
	type WaitingThreadRow,
} from "./waiting";

const activated = new Date("2026-09-01T00:00:00Z");

function thread(
	overrides: Partial<Omit<WaitingThreadRow, "workspaceId">> = {},
): Omit<WaitingThreadRow, "workspaceId"> {
	return {
		agentActivatedAt: activated,
		resolvedAt: null,
		lastAuthorKind: "human",
		...overrides,
	};
}

describe("isWaitingOnAgent", () => {
	it("waits when an activated, unresolved thread ends on a human", () => {
		expect(isWaitingOnAgent(thread())).toBe(true);
	});

	it("does not wait when no agent has been activated on the thread", () => {
		expect(isWaitingOnAgent(thread({ agentActivatedAt: null }))).toBe(false);
	});

	it("does not wait once the thread is resolved", () => {
		expect(isWaitingOnAgent(thread({ resolvedAt: new Date() }))).toBe(false);
	});

	it("does not wait while the agent's reply is the last word", () => {
		expect(isWaitingOnAgent(thread({ lastAuthorKind: "agent" }))).toBe(false);
	});

	it("waits again when a human follows up after an agent reply", () => {
		expect(isWaitingOnAgent(thread({ lastAuthorKind: "human" }))).toBe(true);
	});

	it("does not wait when every comment on the thread was deleted", () => {
		expect(isWaitingOnAgent(thread({ lastAuthorKind: null }))).toBe(false);
	});
});

describe("countWaitingByWorkspace", () => {
	it("returns nothing when no thread is waiting", () => {
		expect(
			countWaitingByWorkspace([
				{ workspaceId: "w1", ...thread({ lastAuthorKind: "agent" }) },
				{ workspaceId: "w2", ...thread({ resolvedAt: activated }) },
			]),
		).toEqual([]);
	});

	it("counts waiting threads per workspace and drops the rest", () => {
		expect(
			countWaitingByWorkspace([
				{ workspaceId: "w1", ...thread() },
				{ workspaceId: "w1", ...thread() },
				{ workspaceId: "w1", ...thread({ lastAuthorKind: "agent" }) },
				{ workspaceId: "w2", ...thread() },
				{ workspaceId: "w3", ...thread({ agentActivatedAt: null }) },
			]),
		).toEqual([
			{ workspaceId: "w1", waitingCount: 2 },
			{ workspaceId: "w2", waitingCount: 1 },
		]);
	});

	it("counts one page linked to two workspaces against both", () => {
		expect(
			countWaitingByWorkspace([
				{ workspaceId: "w1", ...thread() },
				{ workspaceId: "w2", ...thread() },
			]),
		).toEqual([
			{ workspaceId: "w1", waitingCount: 1 },
			{ workspaceId: "w2", waitingCount: 1 },
		]);
	});
});
