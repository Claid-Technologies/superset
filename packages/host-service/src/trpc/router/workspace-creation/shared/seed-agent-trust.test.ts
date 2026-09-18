import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HostDb } from "../../../../db";
import {
	carryFolderTrust,
	isCodexFolderTrusted,
	resolveTrustFamily,
	seedAgentWorkspaceTrust,
	seedClaudeFolderTrust,
	seedCodexFolderTrust,
} from "./seed-agent-trust";

let dir: string;
let previousSupersetHome: string | undefined;

beforeEach(() => {
	dir = realpathSync(mkdtempSync(join(tmpdir(), "seed-agent-trust-")));
	previousSupersetHome = process.env.SUPERSET_HOME_DIR;
	process.env.SUPERSET_HOME_DIR = join(dir, "superset-home");
});

afterEach(() => {
	if (previousSupersetHome === undefined) delete process.env.SUPERSET_HOME_DIR;
	else process.env.SUPERSET_HOME_DIR = previousSupersetHome;
	rmSync(dir, { recursive: true, force: true });
});

describe("resolveTrustFamily", () => {
	test("matches by preset id", () => {
		expect(resolveTrustFamily({ presetId: "claude", command: "claude" })).toBe(
			"claude",
		);
		expect(resolveTrustFamily({ presetId: "codex", command: "codex" })).toBe(
			"codex",
		);
	});

	test("matches custom presets by launch executable", () => {
		expect(
			resolveTrustFamily({
				presetId: "custom-abc",
				command: "/usr/local/bin/claude --verbose",
			}),
		).toBe("claude");
		expect(
			resolveTrustFamily({
				presetId: "custom-def",
				command: "C:\\tools\\codex.exe",
			}),
		).toBe("codex");
	});

	test("returns null for providers without a known trust store", () => {
		expect(resolveTrustFamily({ presetId: "gemini", command: "gemini" })).toBe(
			null,
		);
		expect(
			resolveTrustFamily({ presetId: "custom-xyz", command: "my-agent" }),
		).toBe(null);
	});
});

describe("seedClaudeFolderTrust", () => {
	test("creates the state file with the trusted entry", async () => {
		const file = join(dir, ".claude.json");
		await seedClaudeFolderTrust(file, "/tmp/session-a");
		const state = JSON.parse(readFileSync(file, "utf-8"));
		expect(state.projects["/tmp/session-a"].hasTrustDialogAccepted).toBe(true);
	});

	test("merges into existing state, preserving other keys", async () => {
		const file = join(dir, ".claude.json");
		writeFileSync(
			file,
			JSON.stringify({
				oauthAccount: { emailAddress: "x@y.z" },
				projects: {
					"/existing": { hasTrustDialogAccepted: true, allowedTools: ["Bash"] },
					"/tmp/session-b": { allowedTools: ["Edit"] },
				},
			}),
		);
		await seedClaudeFolderTrust(file, "/tmp/session-b");
		const state = JSON.parse(readFileSync(file, "utf-8"));
		expect(state.oauthAccount.emailAddress).toBe("x@y.z");
		expect(state.projects["/existing"].allowedTools).toEqual(["Bash"]);
		expect(state.projects["/tmp/session-b"]).toEqual({
			allowedTools: ["Edit"],
			hasTrustDialogAccepted: true,
		});
	});

	test("no-ops when the entry is already trusted", async () => {
		const file = join(dir, ".claude.json");
		const content = JSON.stringify({
			projects: { "/tmp/session-c": { hasTrustDialogAccepted: true } },
		});
		writeFileSync(file, content);
		await seedClaudeFolderTrust(file, "/tmp/session-c");
		expect(readFileSync(file, "utf-8")).toBe(content);
	});

	test("throws on a corrupt state file without clobbering it", async () => {
		const file = join(dir, ".claude.json");
		writeFileSync(file, "{not json");
		await expect(
			seedClaudeFolderTrust(file, "/tmp/session-d"),
		).rejects.toThrow();
		expect(readFileSync(file, "utf-8")).toBe("{not json");
	});

	test("skips when the config dir itself does not exist", async () => {
		const file = join(dir, "missing-profile", ".claude.json");
		await seedClaudeFolderTrust(file, "/tmp/session-e");
		expect(() => readFileSync(file, "utf-8")).toThrow();
	});

	test("preserves a tightened file mode across the rewrite", async () => {
		const file = join(dir, ".claude.json");
		writeFileSync(file, "{}");
		chmodSync(file, 0o600);
		await seedClaudeFolderTrust(file, "/tmp/session-f");
		expect(statSync(file).mode & 0o777).toBe(0o600);
	});

	test("creates a brand-new store owner-only", async () => {
		const file = join(dir, ".claude.json");
		await seedClaudeFolderTrust(file, "/tmp/session-g");
		expect(statSync(file).mode & 0o777).toBe(0o600);
	});
});

describe("seedCodexFolderTrust", () => {
	test("creates config.toml with the trusted table", async () => {
		const file = join(dir, "config.toml");
		await seedCodexFolderTrust(file, "/tmp/session-a");
		expect(readFileSync(file, "utf-8")).toBe(
			'[projects."/tmp/session-a"]\ntrust_level = "trusted"\n',
		);
	});

	test("appends after existing content, preserving it", async () => {
		const file = join(dir, "config.toml");
		writeFileSync(
			file,
			'model = "gpt-5"\n\n[projects."/other"]\ntrust_level = "trusted"\n',
		);
		await seedCodexFolderTrust(file, "/tmp/session-b");
		expect(readFileSync(file, "utf-8")).toBe(
			'model = "gpt-5"\n\n[projects."/other"]\ntrust_level = "trusted"\n\n[projects."/tmp/session-b"]\ntrust_level = "trusted"\n',
		);
	});

	test("leaves an existing table for the path untouched", async () => {
		const file = join(dir, "config.toml");
		const content = '[projects."/tmp/session-c"]\ntrust_level = "untrusted"\n';
		writeFileSync(file, content);
		await seedCodexFolderTrust(file, "/tmp/session-c");
		expect(readFileSync(file, "utf-8")).toBe(content);
	});

	test("escapes quotes and backslashes in the path key", async () => {
		const file = join(dir, "config.toml");
		await seedCodexFolderTrust(file, '/tmp/we"ird\\path');
		expect(readFileSync(file, "utf-8")).toBe(
			'[projects."/tmp/we\\"ird\\\\path"]\ntrust_level = "trusted"\n',
		);
	});

	test("skips when the codex home does not exist", async () => {
		const file = join(dir, "missing-home", "config.toml");
		await seedCodexFolderTrust(file, "/tmp/session-d");
		expect(() => readFileSync(file, "utf-8")).toThrow();
	});

	test("detects an equivalent header with different spacing", async () => {
		const file = join(dir, "config.toml");
		const content =
			'[ projects . "/tmp/session-e" ]\ntrust_level = "untrusted"\n';
		writeFileSync(file, content);
		await seedCodexFolderTrust(file, "/tmp/session-e");
		expect(readFileSync(file, "utf-8")).toBe(content);
	});

	test("detects a literal-string header", async () => {
		const file = join(dir, "config.toml");
		const content =
			"[projects.'/tmp/session-f']\ntrust_level = \"untrusted\"\n";
		writeFileSync(file, content);
		await seedCodexFolderTrust(file, "/tmp/session-f");
		expect(readFileSync(file, "utf-8")).toBe(content);
	});

	test("detects a top-level dotted key", async () => {
		const file = join(dir, "config.toml");
		const content = 'projects."/tmp/session-g".trust_level = "untrusted"\n';
		writeFileSync(file, content);
		await seedCodexFolderTrust(file, "/tmp/session-g");
		expect(readFileSync(file, "utf-8")).toBe(content);
	});

	test("matches an escaped header against the raw path", async () => {
		const file = join(dir, "config.toml");
		const content =
			'[projects."/tmp/we\\"ird\\\\path"]\ntrust_level = "untrusted"\n';
		writeFileSync(file, content);
		await seedCodexFolderTrust(file, '/tmp/we"ird\\path');
		expect(readFileSync(file, "utf-8")).toBe(content);
	});

	test("still appends when only a different path is defined", async () => {
		const file = join(dir, "config.toml");
		writeFileSync(file, '[ projects . "/other" ]\ntrust_level = "trusted"\n');
		await seedCodexFolderTrust(file, "/tmp/session-h");
		expect(readFileSync(file, "utf-8")).toContain(
			'[projects."/tmp/session-h"]\ntrust_level = "trusted"\n',
		);
	});
});

function mockDb(options: {
	defaultClaudeConfigDir?: string;
	defaultCodexHome?: string;
	repoPath?: string;
}): HostDb {
	return {
		select: () => ({
			from: () => ({
				get: () => ({
					defaultClaudeConfigDir: options.defaultClaudeConfigDir ?? null,
					defaultCodexHome: options.defaultCodexHome ?? null,
				}),
				where: () => ({
					get: () =>
						options.repoPath ? { repoPath: options.repoPath } : undefined,
				}),
			}),
		}),
	} as unknown as HostDb;
}

function trustedState(...folders: string[]): string {
	return JSON.stringify({
		oauthAccount: { emailAddress: "someone@example.com" },
		projects: Object.fromEntries(
			folders.map((folder) => [folder, { hasTrustDialogAccepted: true }]),
		),
	});
}

function readProjects(file: string): Record<string, unknown> {
	return JSON.parse(readFileSync(file, "utf-8")).projects ?? {};
}

const claude = { presetId: "claude", command: "claude", env: {} };

describe("seedAgentWorkspaceTrust", () => {
	let personalStore: string;
	let workDir: string;
	let workStore: string;
	let repo: string;
	let worktree: string;
	const stores = async () => [personalStore, workStore];

	beforeEach(() => {
		personalStore = join(dir, "personal.claude.json");
		workDir = join(dir, "claude-work");
		workStore = join(workDir, ".claude.json");
		repo = join(dir, "email-triage");
		worktree = join(dir, "worktrees", "email-triage-feature");
		for (const folder of [workDir, repo, worktree]) {
			mkdirSync(folder, { recursive: true });
		}
		writeFileSync(workStore, trustedState());
	});

	test("project workspace on the project's own checkout inherits trust accepted under another account", async () => {
		writeFileSync(personalStore, trustedState(repo));
		await seedAgentWorkspaceTrust(
			mockDb({ repoPath: repo }),
			{ worktreePath: repo, projectId: "project-1" },
			{ ...claude, env: { CLAUDE_CONFIG_DIR: workDir } },
			stores,
		);
		expect(readProjects(workStore)).toEqual({
			[repo]: { hasTrustDialogAccepted: true },
		});
		expect(JSON.parse(readFileSync(workStore, "utf-8")).oauthAccount).toEqual({
			emailAddress: "someone@example.com",
		});
	});

	test("host-resumed launch, with no per-agent env, targets the selected default account", async () => {
		writeFileSync(personalStore, trustedState(repo));
		await seedAgentWorkspaceTrust(
			mockDb({ defaultClaudeConfigDir: workDir, repoPath: repo }),
			{ worktreePath: repo, projectId: "project-1" },
			claude,
			stores,
		);
		expect(readProjects(workStore)).toEqual({
			[repo]: { hasTrustDialogAccepted: true },
		});
	});

	test("worktree workspace inherits the main checkout's trust, keyed on the main checkout", async () => {
		writeFileSync(personalStore, trustedState(repo));
		await seedAgentWorkspaceTrust(
			mockDb({ repoPath: repo }),
			{ worktreePath: worktree, projectId: "project-1" },
			{ ...claude, env: { CLAUDE_CONFIG_DIR: workDir } },
			stores,
		);
		expect(readProjects(workStore)).toEqual({
			[repo]: { hasTrustDialogAccepted: true },
		});
	});

	test("project folder no account has accepted is left to the dialog", async () => {
		writeFileSync(personalStore, trustedState(join(dir, "elsewhere")));
		const before = readFileSync(workStore, "utf-8");
		await seedAgentWorkspaceTrust(
			mockDb({ repoPath: repo }),
			{ worktreePath: repo, projectId: "project-1" },
			{ ...claude, env: { CLAUDE_CONFIG_DIR: workDir } },
			stores,
		);
		expect(readFileSync(workStore, "utf-8")).toBe(before);
	});

	test("already-trusted target is a no-op that never scans for other accounts", async () => {
		writeFileSync(workStore, trustedState(repo));
		const before = readFileSync(workStore, "utf-8");
		let scanned = false;
		await seedAgentWorkspaceTrust(
			mockDb({ repoPath: repo }),
			{ worktreePath: worktree, projectId: "project-1" },
			{ ...claude, env: { CLAUDE_CONFIG_DIR: workDir } },
			async () => {
				scanned = true;
				return [personalStore];
			},
		);
		expect(scanned).toBe(false);
		expect(readFileSync(workStore, "utf-8")).toBe(before);
	});

	test("corrupt target state file is left untouched", async () => {
		writeFileSync(personalStore, trustedState(repo));
		writeFileSync(workStore, "{not json");
		await seedAgentWorkspaceTrust(
			mockDb({ repoPath: repo }),
			{ worktreePath: repo, projectId: "project-1" },
			{ ...claude, env: { CLAUDE_CONFIG_DIR: workDir } },
			stores,
		);
		expect(readFileSync(workStore, "utf-8")).toBe("{not json");
	});

	test("corrupt source state file is not evidence of trust", async () => {
		writeFileSync(
			personalStore,
			`{"projects":{"${repo}":{"hasTrustDialogAccepted":true}`,
		);
		const before = readFileSync(workStore, "utf-8");
		await seedAgentWorkspaceTrust(
			mockDb({ repoPath: repo }),
			{ worktreePath: repo, projectId: "project-1" },
			{ ...claude, env: { CLAUDE_CONFIG_DIR: workDir } },
			stores,
		);
		expect(readFileSync(workStore, "utf-8")).toBe(before);
	});

	test("session workspace is seeded outright without consulting other accounts", async () => {
		const session = join(dir, "session");
		mkdirSync(session);
		let scanned = false;
		await seedAgentWorkspaceTrust(
			mockDb({}),
			{ worktreePath: session, projectId: null },
			{ ...claude, env: { CLAUDE_CONFIG_DIR: workDir } },
			async () => {
				scanned = true;
				return [];
			},
		);
		expect(scanned).toBe(false);
		expect(readProjects(workStore)).toEqual({
			[session]: { hasTrustDialogAccepted: true },
		});
	});

	test("codex project workspace inherits trust from another CODEX_HOME", async () => {
		const personalHome = join(dir, "codex");
		const workHome = join(dir, "codex-work");
		mkdirSync(personalHome);
		mkdirSync(workHome);
		writeFileSync(
			join(personalHome, "config.toml"),
			`model = "gpt-5"\n\n[projects."${repo}"]\ntrust_level = "trusted"\n`,
		);
		await seedAgentWorkspaceTrust(
			mockDb({ repoPath: repo }),
			{ worktreePath: repo, projectId: "project-1" },
			{ presetId: "codex", command: "codex", env: { CODEX_HOME: workHome } },
			async () => [
				join(personalHome, "config.toml"),
				join(workHome, "config.toml"),
			],
		);
		expect(
			await isCodexFolderTrusted(join(workHome, "config.toml"), repo),
		).toBe(true);
	});
});

describe("carryFolderTrust", () => {
	test("never reads the target as its own evidence", async () => {
		const target = join(dir, ".claude.json");
		writeFileSync(target, trustedState());
		const before = readFileSync(target, "utf-8");
		await carryFolderTrust("claude", target, async () => [target], ["/repo"]);
		expect(readFileSync(target, "utf-8")).toBe(before);
	});

	test("preserves an explicit codex untrusted entry in the target", async () => {
		const source = join(dir, "source.toml");
		const target = join(dir, "target.toml");
		writeFileSync(source, '[projects."/repo"]\ntrust_level = "trusted"\n');
		writeFileSync(target, '[projects."/repo"]\ntrust_level = "untrusted"\n');
		await carryFolderTrust("codex", target, async () => [source], ["/repo"]);
		expect(readFileSync(target, "utf-8")).toBe(
			'[projects."/repo"]\ntrust_level = "untrusted"\n',
		);
	});
});

describe("isCodexFolderTrusted", () => {
	test("reads trust_level only from the matching table", async () => {
		const file = join(dir, "config.toml");
		writeFileSync(
			file,
			'[projects."/other"]\ntrust_level = "trusted"\n\n[projects."/repo"]\ntrust_level = "untrusted"\n',
		);
		expect(await isCodexFolderTrusted(file, "/other")).toBe(true);
		expect(await isCodexFolderTrusted(file, "/repo")).toBe(false);
		expect(await isCodexFolderTrusted(join(dir, "missing.toml"), "/repo")).toBe(
			false,
		);
	});
});
