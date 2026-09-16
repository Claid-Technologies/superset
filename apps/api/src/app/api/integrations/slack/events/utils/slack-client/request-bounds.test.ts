import { describe, expect, test } from "bun:test";
import { SLACK_REQUEST_TIMEOUT_MS, slackRequestBounds } from "./request-bounds";

describe("slackRequestBounds", () => {
	const now = 1_000_000;
	test("caps every request and retries briefly when no deadline is given", () => {
		expect(slackRequestBounds(undefined, now)).toEqual({
			timeout: SLACK_REQUEST_TIMEOUT_MS,
			retries: 2,
		});
	});
	test("keeps the cap while the budget can absorb retries", () => {
		expect(slackRequestBounds(now + 240_000, now)).toEqual({
			timeout: SLACK_REQUEST_TIMEOUT_MS,
			retries: 2,
		});
	});
	test("shrinks the cap and drops retries as the deadline nears", () => {
		expect(slackRequestBounds(now + 8_000, now)).toEqual({
			timeout: 8_000,
			retries: 0,
		});
	});
	test("never drops below a usable timeout once the budget is gone", () => {
		expect(slackRequestBounds(now - 1, now)).toEqual({
			timeout: 1_000,
			retries: 0,
		});
	});
});
