import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const PAGE_ID = "5d3f2a1e-0c7b-4a2d-9f11-6b8c0d4e7a52";
const WORKSPACE_ID = "ws-local";

type Watcher = { pageId: string; terminalId: string; agentId: string | null };
type CloudWatch = { watching: boolean; agentId: string | null };

let localWatchers: Watcher[] = [];
let cloudWatch: CloudWatch = { watching: false, agentId: null };

mock.module("renderer/hooks/host-service/usePageWatchers", () => ({
	usePageWatchers: () =>
		new Map(localWatchers.map((watcher) => [watcher.pageId, watcher])),
}));
mock.module("renderer/hooks/host-service/useTerminalAgentBindings", () => ({
	useTerminalAgentBindings: () => new Map(),
}));
mock.module("renderer/lib/cloud-trpc", () => ({
	cloudTrpc: {
		useUtils: () => ({ page: { get: { invalidate: async () => {} } } }),
		page: { get: { useQuery: () => ({ data: { watch: cloudWatch } }) } },
	},
}));
mock.module("@superset/workspace-client", () => ({
	workspaceTrpc: {
		pageWatch: {
			assign: { useMutation: () => ({ mutate: () => {}, isPending: false }) },
			unwatch: { useMutation: () => ({ mutate: () => {}, isPending: false }) },
		},
	},
}));

const { act, cleanup, fireEvent, render, within } = await import(
	"@testing-library/react"
);
const { PageWatcherMenu } = await import("./PageWatcherMenu");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

beforeEach(() => {
	localWatchers = [];
	cloudWatch = { watching: false, agentId: null };
});

async function openMenu() {
	let view!: ReturnType<typeof render>;
	await act(async () => {
		view = render(
			<PageWatcherMenu
				workspaceId={WORKSPACE_ID}
				pageId={PAGE_ID}
				pageTitle="Release notes"
				pageSlug="release-notes"
			/>,
		);
	});
	const ui = within(view.baseElement as HTMLElement);
	await act(async () => {
		fireEvent.pointerDown(
			ui.getByRole("button"),
			new Event("pointerdown", { bubbles: true }),
		);
	});
	return ui;
}

describe("a page watched by an agent in this workspace", () => {
	beforeEach(() => {
		localWatchers = [
			{ pageId: PAGE_ID, terminalId: "term-1", agentId: "claude" },
		];
		cloudWatch = { watching: true, agentId: "claude" };
	});

	test("names the agent comments reach", async () => {
		const ui = await openMenu();
		expect(ui.getByText("Comments go to this agent")).toBeDefined();
	});

	test("offers to stop watching, because the watcher is ours to stop", async () => {
		const ui = await openMenu();
		expect(ui.getByText("Stop watching")).toBeDefined();
	});
});

describe("a page watched by an agent in another workspace", () => {
	beforeEach(() => {
		cloudWatch = { watching: true, agentId: "codex" };
	});

	test("says so rather than claiming nothing is watching", async () => {
		const ui = await openMenu();
		expect(
			ui.getByText("Watched by an agent in another workspace"),
		).toBeDefined();
		expect(ui.queryByText("Nothing is watching this page")).toBeNull();
	});

	test("names the watching agent on the trigger", async () => {
		const ui = await openMenu();
		expect(ui.getByRole("button").textContent).toContain("codex");
	});

	test("falls back to a generic name when the agent is unnamed", async () => {
		cloudWatch = { watching: true, agentId: null };
		const ui = await openMenu();
		expect(ui.getByRole("button").textContent).toContain("An agent");
	});

	test("does not offer to stop a watcher it cannot reach", async () => {
		const ui = await openMenu();
		expect(ui.queryByText("Stop watching")).toBeNull();
	});
});

describe("a page nothing is watching", () => {
	test("says nothing is watching", async () => {
		const ui = await openMenu();
		expect(ui.getByText("Nothing is watching this page")).toBeDefined();
	});
});
