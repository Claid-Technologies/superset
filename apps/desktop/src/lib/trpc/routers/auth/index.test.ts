import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { TRPCError } from "@trpc/server";

function errnoError(code: string): NodeJS.ErrnoException {
	return Object.assign(new Error(`${code}: token file write failed`), {
		code,
	});
}

async function trpcCodeOf(run: () => Promise<unknown>): Promise<string> {
	try {
		await run();
	} catch (error) {
		if (error instanceof TRPCError) return error.code;
		throw error;
	}
	throw new Error("expected the mutation to reject");
}

describe("auth router token writes", () => {
	let caller: ReturnType<
		ReturnType<typeof import("./index").createAuthRouter>["createCaller"]
	>;
	let saveOrganizationIds: ReturnType<
		typeof spyOn<typeof import("./utils/auth-functions"), "saveOrganizationIds">
	>;

	beforeEach(async () => {
		const authFunctions = await import("./utils/auth-functions");
		saveOrganizationIds = spyOn(authFunctions, "saveOrganizationIds");
		const { createAuthRouter } = await import("./index");
		caller = createAuthRouter().createCaller({} as never);
	});

	afterEach(() => {
		saveOrganizationIds.mockRestore();
	});

	const input = { token: "token", organizationIds: [], expectedRevision: 0 };

	test("a full disk is the user's environment, not a bug", async () => {
		saveOrganizationIds.mockRejectedValue(errnoError("ENOSPC"));

		expect(await trpcCodeOf(() => caller.persistOrganizationIds(input))).toBe(
			"PRECONDITION_FAILED",
		);
	});

	test("a write lock that never frees up is still reported as a bug", async () => {
		saveOrganizationIds.mockRejectedValue(errnoError("ELOCKED"));

		expect(await trpcCodeOf(() => caller.persistOrganizationIds(input))).toBe(
			"INTERNAL_SERVER_ERROR",
		);
	});

	test("an error without an errno is still reported as a bug", async () => {
		saveOrganizationIds.mockRejectedValue(
			new Error("Organization membership revision exhausted"),
		);

		expect(await trpcCodeOf(() => caller.persistOrganizationIds(input))).toBe(
			"INTERNAL_SERVER_ERROR",
		);
	});
});
