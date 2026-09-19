import { describe, expect, test } from "bun:test";
import { withDeadline } from "./withDeadline";

describe("withDeadline", () => {
	test("passes a result through", async () => {
		expect(await withDeadline(Promise.resolve(7), 50)).toBe(7);
	});

	test("passes a rejection through", async () => {
		await expect(
			withDeadline(Promise.reject(new Error("boom")), 50),
		).rejects.toThrow("boom");
	});

	test("rejects work that never settles", async () => {
		await expect(withDeadline(new Promise(() => {}), 20)).rejects.toThrow(
			"timed out",
		);
	});
});
