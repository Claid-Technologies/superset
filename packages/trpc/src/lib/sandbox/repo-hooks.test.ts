import { describe, expect, test } from "bun:test";
import { mergeHooks } from "./repo-hooks";

describe("mergeHooks", () => {
	test("the environment's override wins key by key", () => {
		expect(
			mergeHooks(
				{ start: ["bun dev"], ports: [3000], setup: ["bun install"] },
				{ start: ["superset-dev-stack"] },
			),
		).toEqual({
			start: ["superset-dev-stack"],
			ports: [3000],
			setup: ["bun install"],
		});
	});

	test("nothing declared anywhere is nothing", () => {
		expect(mergeHooks(null, null)).toEqual({
			setup: undefined,
			start: undefined,
			ports: undefined,
		});
	});
});
