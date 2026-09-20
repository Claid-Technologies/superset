import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom over the preloaded plain-object document. Process-wide, so this
// unregisters in afterAll to leave the other renderer suites their document.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render, within } = await import(
	"@testing-library/react"
);
const { MultiRepoProjectForm } = await import(
	"./components/MultiRepoProjectForm"
);
const { appendFolder, removeFolder } = await import(
	"./MultiRepoProjectModal.utils"
);

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const FOLDERS = appendFolder(appendFolder([], "/repos/api"), "/repos/web");

async function renderForm(
	overrides: Partial<Parameters<typeof MultiRepoProjectForm>[0]> = {},
) {
	const onRemoveFolder = mock((_path: string) => {});
	let view!: ReturnType<typeof render>;
	await act(async () => {
		view = render(
			<MultiRepoProjectForm
				name=""
				folders={FOLDERS}
				committedPaths={[]}
				failure={null}
				isWorking={false}
				isPicking={false}
				onNameChange={() => {}}
				onAddFolder={() => {}}
				onRemoveFolder={onRemoveFolder}
				onCancel={() => {}}
				onCreate={() => {}}
				{...overrides}
			/>,
		);
	});
	return { ui: within(view.baseElement as HTMLElement), onRemoveFolder };
}

function createButton(ui: Awaited<ReturnType<typeof renderForm>>["ui"]) {
	return ui.getByText("Create project").closest("button");
}

describe("the Create project button", () => {
	test("is disabled until a folder is picked", async () => {
		const empty = await renderForm({ folders: [] });
		expect(createButton(empty.ui)?.disabled).toBe(true);

		cleanup();

		const picked = await renderForm();
		expect(createButton(picked.ui)?.disabled).toBe(false);
	});
});

describe("the Primary badge", () => {
	test("sits on the first folder and nowhere else", async () => {
		const { ui } = await renderForm();

		expect(ui.getAllByTestId("selected-folder-primary-badge")).toHaveLength(1);
		const badged = ui
			.getByTestId("selected-folder-primary-badge")
			.closest("[data-testid=selected-folder-row]");
		expect(badged?.getAttribute("data-folder")).toBe("api");
	});
});

describe("removing a folder before creating", () => {
	test("asks the parent to drop that path and re-badges the new first row", async () => {
		const { ui, onRemoveFolder } = await renderForm();

		await act(async () => {
			fireEvent.click(ui.getByLabelText("Remove api"));
		});
		expect(onRemoveFolder).toHaveBeenCalledWith("/repos/api");

		cleanup();

		const remaining = removeFolder(FOLDERS, "/repos/api");
		const after = await renderForm({ folders: remaining });
		const badged = after.ui
			.getByTestId("selected-folder-primary-badge")
			.closest("[data-testid=selected-folder-row]");
		expect(badged?.getAttribute("data-folder")).toBe("web");
	});

	test("is refused for folders the host already accepted", async () => {
		const { ui } = await renderForm({ committedPaths: ["/repos/api"] });

		expect(ui.getByLabelText("Remove api").hasAttribute("disabled")).toBe(true);
		expect(ui.getByLabelText("Remove web").hasAttribute("disabled")).toBe(
			false,
		);
	});
});
