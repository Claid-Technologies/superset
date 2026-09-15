import { beforeEach, expect, mock, test } from "bun:test";

let postCount = 0;
const postMessage = mock(async (_args: Record<string, unknown>) => ({
	ts: `msg-${++postCount}`,
}));
const updateMessage = mock(async (_args: Record<string, unknown>) => ({}));
const deleteMessage = mock(async (_args: Record<string, unknown>) => ({}));
const setStatus = mock(async (_args: Record<string, unknown>) => ({}));
const addReaction = mock(async (_args: unknown) => ({}));
const removeReaction = mock(async (_args: unknown) => ({}));
const runAgent = mock(async (_args: Record<string, unknown>) => ({
	text: "**Completed**",
	actions: [],
}));
type Claim =
	| { status: "claimed"; id: string }
	| { status: "duplicate" }
	| { status: "stale" };
const claim = mock(
	async (_args: unknown): Promise<Claim> => ({
		status: "claimed",
		id: "delivery",
	}),
);
const finish = mock(async (_id: string, _succeeded: boolean) => {});
const findLink = mock(
	async (_args: unknown): Promise<{ userId: string } | undefined> => ({
		userId: "linked-user",
	}),
);
mock.module("@superset/db/client", () => ({
	db: {
		query: {
			integrationConnections: {
				findFirst: async () => ({
					organizationId: "org",
					accessToken: "token",
				}),
			},
			subscriptions: { findFirst: async () => ({ id: "subscription" }) },
		},
	},
}));
mock.module("@/lib/analytics", () => ({ posthog: { capture: () => {} } }));
mock.module("../../lib/find-slack-user-link", () => ({
	findSlackUserLink: findLink,
}));
mock.module("../utils/generate-connect-url", () => ({
	generateConnectUrl: () => "https://app.superset.sh/connect",
}));
mock.module("../utils/run-agent", () => ({
	runSlackAgent: runAgent,
	resolveUserMentions: async () => (text: string) => text,
	formatErrorForSlack: async () => "Unable to finish",
	SlackAgentError: class extends Error {},
}));
mock.module("../utils/agent-delivery", () => ({
	claimAgentDelivery: claim,
	finishAgentDelivery: finish,
}));
mock.module("../utils/slack-client", () => ({
	createSlackClient: () => ({
		chat: { postMessage, update: updateMessage, delete: deleteMessage },
		assistant: { threads: { setStatus } },
		reactions: { add: addReaction, remove: removeReaction },
	}),
	isUnpostableChannelError: () => false,
}));
// Mock the barrel only; the image utility's own tests import its implementation.
mock.module("../utils/slack-image-assets", () => ({
	extractSlackImageAssets: async () => [],
	formatSlackImageAssetError: () => "Invalid image",
	SlackImageAssetError: class extends Error {},
}));
const { processAgentMessage } = await import("./process-agent-message");
const params = {
	teamId: "T1",
	eventId: "E1",
	event: {
		type: "app_mention" as const,
		user: "U1",
		text: "Help",
		channel: "C1",
		ts: "10.0",
		event_ts: "10.0",
		thread_ts: "1.0",
	},
};

beforeEach(() => {
	postCount = 0;
	postMessage.mockClear();
	updateMessage.mockClear();
	deleteMessage.mockClear();
	setStatus.mockClear();
	addReaction.mockClear();
	removeReaction.mockClear();
	runAgent.mockClear();
	claim.mockClear();
	finish.mockClear();
	findLink.mockClear();
});

test("mentions run as their linked author and post a final Markdown reply", async () => {
	await processAgentMessage(params);
	expect(findLink).toHaveBeenCalledWith({
		organizationId: "org",
		slackUserId: "U1",
		teamId: "T1",
	});
	expect(runAgent.mock.calls[0]?.[0]).toMatchObject({
		userId: "linked-user",
		messageTs: "10.0",
		threadTs: "1.0",
	});
	// Channel: a placeholder carries progress, the final reply is a new
	// message, and the placeholder is removed once the reply exists.
	expect(postMessage).toHaveBeenCalledTimes(2);
	expect(postMessage.mock.calls[0]?.[0]).toMatchObject({
		thread_ts: "1.0",
		text: "Thinking...",
	});
	expect(postMessage.mock.calls[1]?.[0]).toMatchObject({
		thread_ts: "1.0",
		text: "**Completed**",
		blocks: [{ type: "markdown", text: "**Completed**" }],
	});
	expect(deleteMessage).toHaveBeenCalledWith({ channel: "C1", ts: "msg-1" });
	expect(setStatus).not.toHaveBeenCalled();
	expect(finish).toHaveBeenCalledWith("delivery", true);
	expect(removeReaction).toHaveBeenCalledTimes(1);
});

test("channel progress updates edit the placeholder instead of posting", async () => {
	runAgent.mockImplementationOnce(async (args) => {
		await (args.onProgress as (s: string) => Promise<void>)("Creating task...");
		return { text: "Done", actions: [] };
	});
	await processAgentMessage(params);
	expect(updateMessage).toHaveBeenCalledWith({
		channel: "C1",
		ts: "msg-1",
		text: "Creating task...",
	});
	expect(postMessage).toHaveBeenCalledTimes(2);
});

test("a stale claim posts a lost-track notice and clears indicators without running", async () => {
	claim.mockImplementationOnce(async () => ({ status: "stale" }));
	await processAgentMessage(params);
	expect(runAgent).not.toHaveBeenCalled();
	expect(finish).not.toHaveBeenCalled();
	expect(postMessage).toHaveBeenCalledTimes(1);
	expect(postMessage.mock.calls[0]?.[0].text).toContain("lost track");
	expect(removeReaction).toHaveBeenCalledTimes(1);
});

test("the claim happens before image preflight so a killed preflight is still recognised", async () => {
	await processAgentMessage(params);
	expect(claim).toHaveBeenCalledTimes(1);
	const claimOrder = claim.mock.invocationCallOrder[0] ?? 0;
	const agentOrder = runAgent.mock.invocationCallOrder[0] ?? 0;
	expect(claimOrder).toBeLessThan(agentOrder);
	expect(runAgent.mock.calls[0]?.[0]).toHaveProperty("deadline");
});

test("a duplicate delivery does not run, post, or clear another run's indicators", async () => {
	claim.mockImplementationOnce(async () => ({ status: "duplicate" }));
	await processAgentMessage(params);
	expect(runAgent).not.toHaveBeenCalled();
	expect(postMessage).not.toHaveBeenCalled();
	expect(setStatus).not.toHaveBeenCalled();
	expect(removeReaction).not.toHaveBeenCalled();
});

test("an unlinked author only receives a connect prompt", async () => {
	findLink.mockImplementationOnce(async () => undefined);
	await processAgentMessage(params);
	expect(runAgent).not.toHaveBeenCalled();
	expect(claim).not.toHaveBeenCalled();
	expect(postMessage.mock.calls[0]?.[0].text).toContain(
		"link your Slack account",
	);
});

test("DMs use the same guarded path with assistant status instead of a placeholder", async () => {
	await processAgentMessage({
		...params,
		event: { ...params.event, type: "message", channel_type: "im" },
	});
	expect(runAgent).toHaveBeenCalledTimes(1);
	expect(claim).toHaveBeenCalledWith({
		teamId: "T1",
		channelId: "C1",
		messageTs: "10.0",
	});
	expect(setStatus.mock.calls[0]?.[0]).toMatchObject({ status: "Thinking..." });
	expect(setStatus.mock.calls.at(-1)?.[0]).toMatchObject({ status: "" });
	expect(postMessage).toHaveBeenCalledTimes(1);
	expect(postMessage.mock.calls[0]?.[0].text).toBe("**Completed**");
	expect(deleteMessage).not.toHaveBeenCalled();
});
