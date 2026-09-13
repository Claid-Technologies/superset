import { afterEach, describe, expect, mock, test } from "bun:test";

let createInput: Record<string, unknown> | undefined;
let sessionInput: Record<string, unknown> | undefined;

mock.module("../../../lib/host-target", () => ({
	requireHostTarget: () => "host-1",
	resolveHostTarget: () => ({
		hostId: "host-1",
		client: {
			workspaces: {
				createSession: {
					mutate: async (input: Record<string, unknown>) => {
						sessionInput = input;
						return { workspace: { name: "scratch" } };
					},
				},
				create: {
					mutate: async (input: Record<string, unknown>) => {
						createInput = input;
						return {
							workspace: { name: "agent-effort" },
							alreadyExists: false,
						};
					},
				},
			},
		},
	}),
}));

mock.module("../../../lib/upload-attachments", () => ({
	uploadAttachments: async () => [],
}));

const { default: createWorkspaceCommand } = await import("./command");

function invoke(
	overrides: {
		agent?: string;
		prompt?: string;
		effort?: string;
		tag?: string[];
		project?: string | undefined;
		session?: boolean;
		cloud?: boolean;
		local?: boolean;
		branch?: string | undefined;
		model?: string;
	} = {},
) {
	return createWorkspaceCommand.run({
		ctx: {
			config: { organizationId: "org-1" },
			bearer: "bearer",
		} as never,
		args: {} as never,
		options: {
			local: true,
			project: "project-1",
			name: "agent-effort",
			branch: "agent/effort",
			...overrides,
		} as never,
		signal: new AbortController().signal,
	});
}

afterEach(() => {
	createInput = undefined;
	sessionInput = undefined;
});

describe("workspaces create", () => {
	for (const session of [undefined, false]) {
		test(`rejects missing project when session is ${session}`, async () => {
			await expect(
				invoke({ project: undefined, branch: undefined, session }),
			).rejects.toThrow(/Specify --project or --session/);
			expect(createInput).toBeUndefined();
			expect(sessionInput).toBeUndefined();
		});
	}

	test("rejects --session with --project", async () => {
		await expect(invoke({ session: true })).rejects.toThrow(
			/--session cannot be combined with --project/,
		);
		expect(createInput).toBeUndefined();
		expect(sessionInput).toBeUndefined();
	});

	test("rejects --session with --cloud", async () => {
		await expect(
			invoke({ project: undefined, session: true, cloud: true, local: false }),
		).rejects.toThrow(/--session does not apply to --cloud/);
		expect(createInput).toBeUndefined();
		expect(sessionInput).toBeUndefined();
	});

	test("creates a session only with explicit --session", async () => {
		await invoke({ project: undefined, branch: undefined, session: true });
		expect(sessionInput).toMatchObject({ name: "agent-effort" });
		expect(createInput).toBeUndefined();
	});

	test("forwards model to the agent launched with the workspace", async () => {
		await invoke({
			agent: "claude",
			prompt: "Implement the feature",
			model: "sonnet",
		});

		expect(createInput).toMatchObject({
			agents: [
				{
					agent: "claude",
					prompt: "Implement the feature",
					model: "sonnet",
				},
			],
		});
	});

	test("forwards effort to the agent launched with the workspace", async () => {
		await invoke({
			agent: "claude",
			prompt: "Implement the feature",
			effort: "high",
		});

		expect(createInput).toMatchObject({
			agents: [
				{
					agent: "claude",
					prompt: "Implement the feature",
					effort: "high",
				},
			],
		});
	});

	test("rejects effort when no agent is selected", async () => {
		await expect(invoke({ effort: "high" })).rejects.toThrow(
			/--effort requires --agent/,
		);
		expect(createInput).toBeUndefined();
	});

	test("forwards repeatable --tag values as the tags set", async () => {
		await invoke({ tag: ["Perf Work", "infra"] });
		expect(createInput).toMatchObject({ tags: ["Perf Work", "infra"] });
	});

	test("omits tags entirely when --tag is not passed", async () => {
		await invoke();
		expect(createInput).not.toHaveProperty("tags");
	});

	test("rejects --tag on a project-less session", async () => {
		await expect(
			invoke({
				project: undefined,
				session: true,
				branch: undefined,
				tag: ["perf"],
			}),
		).rejects.toThrow(/--tag requires --project/);
		expect(createInput).toBeUndefined();
	});

	test("rejects model when no agent is selected", async () => {
		await expect(invoke({ model: "sonnet" })).rejects.toThrow(
			/--model requires --agent/,
		);
		expect(createInput).toBeUndefined();
	});
});
