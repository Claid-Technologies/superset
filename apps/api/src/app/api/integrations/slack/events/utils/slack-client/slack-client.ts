import { WebClient } from "@slack/web-api";

/**
 * Slack platform errors meaning "this channel cannot receive our reply" —
 * read-only/announcement channels, archived channels, or the bot lacking
 * membership. Retrying can never succeed, so callers drop the event.
 */
const UNPOSTABLE_CHANNEL_ERRORS = new Set([
	"restricted_action_read_only_channel",
	"restricted_action_thread_only_channel",
	"restricted_action_non_threadable_channel",
	"restricted_action",
	"is_archived",
	"channel_not_found",
	"not_in_channel",
]);

export function isUnpostableChannelError(error: unknown): boolean {
	const code = (error as { data?: { error?: string } } | null)?.data?.error;
	return typeof code === "string" && UNPOSTABLE_CHANNEL_ERRORS.has(code);
}

const REQUEST_TIMEOUT_MS = 15_000;
const RETRY_CONFIG = { retries: 2, minTimeout: 500, maxTimeout: 2_000 };

export function createSlackClient(token: string): WebClient {
	return new WebClient(token, {
		timeout: REQUEST_TIMEOUT_MS,
		retryConfig: RETRY_CONFIG,
	});
}
