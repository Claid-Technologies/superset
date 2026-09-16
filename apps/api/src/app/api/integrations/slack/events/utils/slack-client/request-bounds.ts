export const SLACK_REQUEST_TIMEOUT_MS = 15_000;
const MIN_REQUEST_TIMEOUT_MS = 1_000;
const RETRIES = 2;

export interface SlackRequestBounds {
	timeout: number;
	retries: number;
}

/**
 * A healthy Slack call finishes in well under 15s, so the cap only exists to
 * turn a stalled connection into an error. With a run deadline, the cap and
 * the retry count shrink so no call, retries included, outlives the budget.
 */
export function slackRequestBounds(
	deadline: number | undefined,
	now = Date.now(),
): SlackRequestBounds {
	const remaining =
		deadline === undefined ? Number.POSITIVE_INFINITY : deadline - now;
	const timeout = Math.max(
		MIN_REQUEST_TIMEOUT_MS,
		Math.min(SLACK_REQUEST_TIMEOUT_MS, remaining),
	);
	const retries = remaining >= timeout * (RETRIES + 1) ? RETRIES : 0;
	return { timeout, retries };
}
