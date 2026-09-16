import { db } from "@superset/db/client";
import {
	type SelectSlackThreadSession,
	type SlackThreadEntity,
	slackThreadSessions,
} from "@superset/db/schema";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { and, eq, sql } from "drizzle-orm";
import { posthog } from "@/lib/analytics";
import type { AgentAction } from "../slack-blocks";

const MAX_REMEMBERED_ENTITIES = 30;

interface ThreadKey {
	teamId: string;
	channelId: string;
	threadTs: string;
}

/** "only respond when I mention you", "only reply when someone @s you", … */
export const QUIET_THREAD_PATTERN =
	/\bonly\s+(?:respond|reply)\b.*\b(?:mention|@|tag)/i;

function whereThread(key: ThreadKey) {
	return and(
		eq(slackThreadSessions.teamId, key.teamId),
		eq(slackThreadSessions.channelId, key.channelId),
		eq(slackThreadSessions.threadTs, key.threadTs),
	);
}

/**
 * Whether an unprompted reply in this thread should reach the agent: the
 * thread has a session, it is not quieted, and the team's flag is on.
 */
export async function threadFollowUpTarget(
	key: ThreadKey,
): Promise<SelectSlackThreadSession | null> {
	const session = await db.query.slackThreadSessions.findFirst({
		where: whereThread(key),
	});
	if (!session || session.quiet) return null;
	const enabled = await posthog.isFeatureEnabled(
		FEATURE_FLAGS.SLACK_THREAD_FOLLOW_UPS,
		`slack-team:${key.teamId}`,
		{ sendFeatureFlagEvents: false },
	);
	return enabled ? session : null;
}

export async function quietThread(
	key: ThreadKey & { organizationId: string; userId: string },
): Promise<void> {
	await db
		.insert(slackThreadSessions)
		.values({
			organizationId: key.organizationId,
			teamId: key.teamId,
			channelId: key.channelId,
			threadTs: key.threadTs,
			startedByUserId: key.userId,
			quiet: true,
		})
		.onConflictDoUpdate({
			target: [
				slackThreadSessions.teamId,
				slackThreadSessions.channelId,
				slackThreadSessions.threadTs,
			],
			set: { quiet: true, lastActivityAt: new Date() },
		});
}

/** Create or resume the thread's session and mark it running. */
export async function beginThreadRun(
	key: ThreadKey & { organizationId: string; userId: string },
): Promise<SelectSlackThreadSession> {
	const [session] = await db
		.insert(slackThreadSessions)
		.values({
			organizationId: key.organizationId,
			teamId: key.teamId,
			channelId: key.channelId,
			threadTs: key.threadTs,
			startedByUserId: key.userId,
			status: "running",
		})
		.onConflictDoUpdate({
			target: [
				slackThreadSessions.teamId,
				slackThreadSessions.channelId,
				slackThreadSessions.threadTs,
			],
			set: { status: "running", lastActivityAt: new Date() },
		})
		.returning();
	if (!session) throw new Error("Slack thread session upsert returned no row");
	return session;
}

export async function finishThreadRun(params: {
	id: string;
	actions: AgentAction[];
	lastContextTs: string;
}): Promise<void> {
	const entities = entitiesFromActions(params.actions);
	await db
		.update(slackThreadSessions)
		.set({
			status: "idle",
			lastContextTs: params.lastContextTs,
			lastActivityAt: new Date(),
			...(entities.length > 0
				? {
						entityLog: sql`(
							SELECT COALESCE(jsonb_agg(e), '[]'::jsonb)
							FROM (
								SELECT e FROM jsonb_array_elements(
									${slackThreadSessions.entityLog} || ${JSON.stringify(entities)}::jsonb
								) AS e
								ORDER BY (e->>'at') DESC
								LIMIT ${MAX_REMEMBERED_ENTITIES}
							) AS newest
						)`,
					}
				: {}),
		})
		.where(eq(slackThreadSessions.id, params.id));
}

function entitiesFromActions(actions: AgentAction[]): SlackThreadEntity[] {
	const at = new Date().toISOString();
	const entities: SlackThreadEntity[] = [];
	for (const action of actions) {
		if (action.type === "task_created" || action.type === "task_updated") {
			for (const task of action.tasks) {
				entities.push({ kind: "task", id: task.id, label: task.slug, at });
			}
		} else if (action.type === "workspace_created") {
			for (const workspace of action.workspaces) {
				entities.push({
					kind: "workspace",
					id: workspace.id,
					label: workspace.branch
						? `${workspace.name} (${workspace.branch})`
						: workspace.name,
					at,
				});
			}
		}
	}
	return entities;
}

/**
 * The block the agent reads so "that workspace" means the one it made two
 * messages ago. Newest first, as stored.
 */
export function renderThreadMemory(entities: SlackThreadEntity[]): string {
	if (entities.length === 0) return "";
	const lines = entities.map(
		(e) => `- ${e.kind} ${e.label} (id: ${e.id})${e.url ? ` ${e.url}` : ""}`,
	);
	return `Earlier in this thread you created these. When someone says "that task" or "that workspace", they mean the most recent one of that kind:\n${lines.join("\n")}`;
}
