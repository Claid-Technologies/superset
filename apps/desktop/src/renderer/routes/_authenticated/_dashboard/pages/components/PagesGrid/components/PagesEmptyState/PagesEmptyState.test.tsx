import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, render } = await import("@testing-library/react");
const { PagesEmptyState } = await import("./PagesEmptyState");
const { PAGE_STARTER_IDS, PAGE_STARTER_REQUESTS } = await import("./starters");
const { buildPageAgentPrompt } = await import(
	"../../../../../utils/pageAgentPrompt"
);

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

describe("PagesEmptyState", () => {
	test("offers a starter for every request plus a blank path", () => {
		const { getAllByRole } = render(
			<PagesEmptyState onCreate={() => {}} isCreating={false} />,
		);

		expect(getAllByRole("button")).toHaveLength(PAGE_STARTER_IDS.length + 1);
	});

	test("sends a starter request the agent prompt carries instead of a question", () => {
		const onCreate = mock((_request?: string) => {});
		const { getByRole } = render(
			<PagesEmptyState onCreate={onCreate} isCreating={false} />,
		);

		getByRole("button", { name: "Walk through a change" }).click();

		const request = onCreate.mock.calls[0]?.[0];
		expect(request).toBe(PAGE_STARTER_REQUESTS["change-walkthrough"]);
		const prompt = buildPageAgentPrompt(request);
		expect(prompt).toContain(PAGE_STARTER_REQUESTS["change-walkthrough"]);
		expect(prompt).not.toContain("ask what I want to create");
	});

	test("keeps a path that starts from nothing", () => {
		const onCreate = mock((_request?: string) => {});
		const { getByRole } = render(
			<PagesEmptyState onCreate={onCreate} isCreating={false} />,
		);

		getByRole("button", { name: "Create with AI" }).click();

		expect(onCreate.mock.calls[0]?.[0]).toBeUndefined();
		expect(buildPageAgentPrompt()).toContain("ask what I want to create");
	});

	test("disables every action while a workspace is being created", () => {
		const { getAllByRole } = render(
			<PagesEmptyState onCreate={() => {}} isCreating />,
		);

		for (const button of getAllByRole("button")) {
			expect((button as HTMLButtonElement).disabled).toBe(true);
		}
	});
});
