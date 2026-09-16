/// <reference types="bun" />
import { afterEach, beforeEach, expect, jest, mock, test } from "bun:test";
import { HttpExchanges } from "./http-exchange";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const request = {
	method: "GET",
	pathWithQuery: "/health",
	headers: {},
	body: new Uint8Array(),
};

test("a slow dial still leaves time for the HTTP response", async () => {
	const exchanges = new HttpExchanges();
	const result = exchanges.begin("ticket", request);
	const dial = { send: mock(() => {}), close: mock(() => {}) };
	jest.advanceTimersByTime(32_000);
	expect(exchanges.has("ticket")).toBe(true);
	exchanges.onDialConnect("ticket", dial);
	expect(dial.send).toHaveBeenCalled();
	jest.advanceTimersByTime(25_000);
	exchanges.onDialMessage(
		"ticket",
		dial,
		JSON.stringify({ type: "http:response", status: 200, headers: {} }),
	);
	exchanges.onDialMessage("ticket", dial, JSON.stringify({ type: "http:end" }));
	expect(await result).toMatchObject({ ok: true, status: 200 });
	expect(exchanges.has("ticket")).toBe(false);
	expect(dial.close).toHaveBeenCalledTimes(1);
});

test("an unanswered HTTP exchange still expires", async () => {
	const exchanges = new HttpExchanges();
	const result = exchanges.begin("ticket", request);
	jest.advanceTimersByTime(65_000);
	expect(await result).toEqual({ ok: false, reason: "timeout" });
	expect(exchanges.has("ticket")).toBe(false);
});

test("a host-reported dial failure fails immediately", async () => {
	const exchanges = new HttpExchanges();
	const result = exchanges.begin("ticket", request);
	exchanges.fail("ticket");
	expect(await result).toEqual({ ok: false, reason: "dial-failed" });
	expect(exchanges.has("ticket")).toBe(false);
});
