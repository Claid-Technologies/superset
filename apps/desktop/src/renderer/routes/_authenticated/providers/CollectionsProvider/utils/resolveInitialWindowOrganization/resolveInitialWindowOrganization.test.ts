import { describe, expect, test } from "bun:test";
import { resolveInitialWindowOrganization } from "./resolveInitialWindowOrganization";

const fresh = <Value>(value: Value) => ({ value, isFresh: true });
const stale = <Value>(value: Value) => ({ value, isFresh: false });

describe("resolveInitialWindowOrganization", () => {
	test("keeps the window's organization while the account belongs to it", () => {
		expect(
			resolveInitialWindowOrganization({
				windowOrganization: fresh("org-a"),
				memberOrganizationIds: fresh(["org-a", "org-a2"]),
				sessionOrganizationId: "org-a2",
			}),
		).toEqual({ status: "resolved", organizationId: "org-a" });
	});

	test("falls back to the session when the account left the window's organization", () => {
		expect(
			resolveInitialWindowOrganization({
				windowOrganization: fresh("org-gone"),
				memberOrganizationIds: fresh(["org-a"]),
				sessionOrganizationId: "org-a",
			}),
		).toEqual({ status: "resolved", organizationId: "org-a" });
	});

	test("a first window with nothing remembered seeds from the session at once", () => {
		expect(
			resolveInitialWindowOrganization({
				windowOrganization: fresh(null),
				memberOrganizationIds: stale(undefined),
				sessionOrganizationId: "org-a",
			}),
		).toEqual({ status: "resolved", organizationId: "org-a" });
	});

	test("does not trust the previous account's cached values after a sign-in", () => {
		// Signed in as account A. The cache still holds account B's organization
		// list and the window organization read during B's session.
		expect(
			resolveInitialWindowOrganization({
				windowOrganization: stale("org-b"),
				memberOrganizationIds: stale(["org-b"]),
				sessionOrganizationId: "org-a",
			}),
		).toEqual({ status: "waiting" });
	});

	test("does not check a fresh window organization against a cached member list", () => {
		expect(
			resolveInitialWindowOrganization({
				windowOrganization: fresh("org-b"),
				memberOrganizationIds: stale(["org-b"]),
				sessionOrganizationId: "org-a",
			}),
		).toEqual({ status: "waiting" });
	});

	test("resolves to the session once both reads are fresh for the new account", () => {
		expect(
			resolveInitialWindowOrganization({
				windowOrganization: fresh("org-b"),
				memberOrganizationIds: fresh(["org-a"]),
				sessionOrganizationId: "org-a",
			}),
		).toEqual({ status: "resolved", organizationId: "org-a" });
	});

	test("waits when there is no session organization to fall back to", () => {
		expect(
			resolveInitialWindowOrganization({
				windowOrganization: fresh(null),
				memberOrganizationIds: fresh([]),
				sessionOrganizationId: null,
			}),
		).toEqual({ status: "waiting" });
	});
});
