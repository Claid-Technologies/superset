/**
 * Pre-trusts a host-created folder in the launching agent CLIs' trust
 * stores, so their first interactive launch skips the "do you trust this
 * folder?" dialog. Session folders need this because they are standalone
 * repos: agent CLIs treat a git repo root as its own trust domain (worktrees
 * inherit from the main checkout, plain dirs from trusted ancestors, but a
 * fresh standalone repo inherits nothing), so every new session would
 * otherwise prompt. Auto-trusting is sound only because the host itself just
 * created the folder as an empty scaffold — never seed a folder with
 * pre-existing user content on the host's own authority.
 *
 * Project folders hold content the host did not write (a clone, a teammate's
 * branch), so adding one to Superset is not a trust decision and the host
 * never makes one for it. Trust is stored per account file, though, so a
 * folder the user accepted under one login prompts again under every other
 * login, and again after switching the default account. For project
 * workspaces the host therefore only carries the user's own recorded
 * acceptance of that exact folder (or of the project's main checkout, which
 * worktrees inherit from) into the launching account's store. A folder no
 * account has accepted still shows the dialog.
 *
 * Each store is the CLI's own sanctioned escape hatch: Claude's untrusted-
 * folder error says to set `projects[<path>].hasTrustDialogAccepted: true`
 * in its state file, and Codex persists `trust_level = "trusted"` in
 * config.toml the same way. Everything here is best-effort — a failed seed
 * just means the dialog shows once.
 */

import { existsSync, realpathSync } from "node:fs";
import {
	chmod,
	mkdtemp,
	readFile,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import type { HostDb } from "../../../../db";
import { projects } from "../../../../db/schema";
import { resolveDefaultAccountEnv } from "../../usage/default-account";
import {
	discoverClaudeProfiles,
	discoverCodexHomes,
} from "../../usage/profiles";

type TrustFamily = "claude" | "codex";

interface TrustTarget {
	family: TrustFamily;
	file: string;
}

/**
 * Provider family of an agent config, from its preset id or launch
 * executable. The executable check covers custom presets that still run the
 * stock `claude`/`codex` binaries (possibly via absolute paths or wrappers
 * named after them).
 */
export function resolveTrustFamily(config: {
	presetId: string;
	command: string;
}): TrustFamily | null {
	const [token = ""] = config.command.trim().split(/\s+/);
	const executable = (token.split(/[\\/]/).pop() ?? "")
		.toLowerCase()
		.replace(/\.exe$/, "");
	for (const family of ["claude", "codex"] as const) {
		if (config.presetId === family || executable === family) return family;
	}
	return null;
}

/**
 * Trust-store file for one agent config, mirroring launch-time resolution:
 * per-agent env wins over the host-default account selection
 * (`{...accountEnv, ...config.env}` in buildTerminalAgentLaunch, and the
 * agent wrapper's pointer-file fallback reads the same DB-backed selection).
 * Claude keeps state inside a custom CLAUDE_CONFIG_DIR but next door at
 * `~/.claude.json` for the default home; Codex always uses
 * `$CODEX_HOME/config.toml`.
 */
function resolveTrustTarget(
	db: HostDb,
	config: { presetId: string; command: string; env: Record<string, string> },
): TrustTarget | null {
	const family = resolveTrustFamily(config);
	if (family === null) return null;
	const env = { ...resolveDefaultAccountEnv(db, family), ...config.env };
	if (family === "claude") {
		const configDir = env.CLAUDE_CONFIG_DIR;
		return {
			family,
			file: configDir
				? join(configDir, ".claude.json")
				: join(homedir(), ".claude.json"),
		};
	}
	const codexHome = env.CODEX_HOME || join(homedir(), ".codex");
	return { family, file: join(codexHome, "config.toml") };
}

/**
 * Same-directory tmp write + rename, so a crash never truncates the store.
 * The replacement keeps the store's existing mode — these files can sit next
 * to credentials, so a user-tightened mode must survive the rewrite — and a
 * brand-new store starts owner-only.
 */
async function atomicWrite(file: string, content: string): Promise<void> {
	const mode = await stat(file).then(
		(info) => info.mode & 0o777,
		() => 0o600,
	);
	const tmpDir = await mkdtemp(join(dirname(file), ".superset-trust-"));
	const tmpFile = join(tmpDir, "next");
	try {
		await writeFile(tmpFile, content);
		await chmod(tmpFile, mode);
		await rename(tmpFile, file);
	} finally {
		await rm(tmpDir, { recursive: true, force: true });
	}
}

/**
 * Merge `projects[<path>].hasTrustDialogAccepted: true` into a Claude state
 * file, preserving every other key. A corrupt file throws instead of being
 * clobbered. No-op when the entry is already trusted.
 */
export async function seedClaudeFolderTrust(
	stateFile: string,
	folderPath: string,
): Promise<void> {
	let state: Record<string, unknown> = {};
	if (existsSync(stateFile)) {
		state = JSON.parse(await readFile(stateFile, "utf-8"));
	} else if (!existsSync(dirname(stateFile))) {
		// A missing config dir means this login was never set up — the CLI's
		// own onboarding (which includes trust) will run anyway.
		return;
	}
	const projects = (state.projects ?? {}) as Record<
		string,
		Record<string, unknown> | undefined
	>;
	// `false` is Claude's default scaffold value ("dialog never accepted"),
	// not a recorded decline — the CLI persists no decline state (declining
	// just exits). So overwriting false → true is the intended seed, unlike
	// Codex's explicit "untrusted", which is preserved below.
	const existing = projects[folderPath];
	if (existing?.hasTrustDialogAccepted === true) return;
	state.projects = {
		...projects,
		[folderPath]: { ...existing, hasTrustDialogAccepted: true },
	};
	await atomicWrite(stateFile, JSON.stringify(state, null, 2));
}

/**
 * True only for a readable store that records acceptance of `folderPath`. A
 * missing or corrupt store is not evidence of anything.
 */
export async function isClaudeFolderTrusted(
	stateFile: string,
	folderPath: string,
): Promise<boolean> {
	try {
		const state = JSON.parse(await readFile(stateFile, "utf-8"));
		return state?.projects?.[folderPath]?.hasTrustDialogAccepted === true;
	} catch {
		return false;
	}
}

const CODEX_PROJECT_ENTRY =
	/^\s*\[?\s*projects\s*\.\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)')\s*[\].]/;

function codexProjectEntryKey(line: string): string | undefined {
	const match = CODEX_PROJECT_ENTRY.exec(line);
	if (!match) return undefined;
	return match[1] !== undefined
		? match[1].replace(/\\(["\\])/g, "$1")
		: match[2];
}

/**
 * True when the config already defines a `projects` entry for `folderPath`,
 * tolerating header spacing and both TOML string styles (plus top-level
 * dotted keys). Appending a duplicate table would make the whole file
 * unparseable for Codex, so detection must be broader than the exact header
 * Codex itself writes.
 */
function codexProjectEntryExists(content: string, folderPath: string): boolean {
	return content
		.split(/\r?\n/)
		.some((line) => codexProjectEntryKey(line) === folderPath);
}

/**
 * True only for the `[projects."<path>"]` table form Codex itself writes,
 * with `trust_level = "trusted"` inside it. Rarer spellings read as untrusted,
 * which costs one dialog instead of a wrongly carried decision.
 */
export async function isCodexFolderTrusted(
	configFile: string,
	folderPath: string,
): Promise<boolean> {
	let content: string;
	try {
		content = await readFile(configFile, "utf-8");
	} catch {
		return false;
	}
	let inTable = false;
	for (const line of content.split(/\r?\n/)) {
		if (/^\s*\[/.test(line)) {
			inTable = codexProjectEntryKey(line) === folderPath;
			continue;
		}
		if (
			inTable &&
			/^\s*trust_level\s*=\s*["']trusted["']\s*(#.*)?$/.test(line)
		) {
			return true;
		}
	}
	return false;
}

/**
 * Append a `[projects."<path>"]` table with `trust_level = "trusted"` to a
 * Codex config.toml. An existing entry for the path is left untouched — a
 * user's explicit "untrusted" must not be overridden.
 */
export async function seedCodexFolderTrust(
	configFile: string,
	folderPath: string,
): Promise<void> {
	let content = "";
	if (existsSync(configFile)) {
		content = await readFile(configFile, "utf-8");
		if (codexProjectEntryExists(content, folderPath)) return;
	} else if (!existsSync(dirname(configFile))) {
		return;
	}
	const escaped = folderPath.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
	const block = `[projects."${escaped}"]\ntrust_level = "trusted"\n`;
	const next =
		content.length === 0 ? block : `${content.replace(/\n*$/, "\n\n")}${block}`;
	await atomicWrite(configFile, next);
}

function normalizeFolderPath(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return resolve(path);
	}
}

const FOLDER_TRUST: Record<
	TrustFamily,
	{
		isTrusted: (file: string, folderPath: string) => Promise<boolean>;
		seed: (file: string, folderPath: string) => Promise<void>;
	}
> = {
	claude: { isTrusted: isClaudeFolderTrusted, seed: seedClaudeFolderTrust },
	codex: { isTrusted: isCodexFolderTrusted, seed: seedCodexFolderTrust },
};

/**
 * Copy the user's acceptance of each of `folderPaths` from any of
 * `sourceFiles` into `targetFile`. Nothing is written when the target already
 * trusts one of them (a worktree inherits from its main checkout) or when no
 * source has accepted any. Sources are listed lazily: finding them scans the
 * home directory, which an already-trusted launch should not pay for.
 */
export async function carryFolderTrust(
	family: TrustFamily,
	targetFile: string,
	listSourceFiles: () => Promise<string[]>,
	folderPaths: string[],
): Promise<void> {
	const { isTrusted, seed } = FOLDER_TRUST[family];
	for (const folderPath of folderPaths) {
		if (await isTrusted(targetFile, folderPath)) return;
	}
	const sources = (await listSourceFiles()).filter(
		(file) => file !== targetFile,
	);
	for (const folderPath of folderPaths) {
		for (const source of sources) {
			if (await isTrusted(source, folderPath)) {
				await seed(targetFile, folderPath);
				break;
			}
		}
	}
}

async function discoverTrustStores(family: TrustFamily): Promise<string[]> {
	if (family === "claude") {
		const profiles = await discoverClaudeProfiles();
		return [
			join(homedir(), ".claude.json"),
			...profiles.map((profile) => join(profile.configDir, ".claude.json")),
		];
	}
	const homes = await discoverCodexHomes();
	return homes.map(({ home }) => join(home, "config.toml"));
}

/**
 * Keep the launching agent from stalling on the trust dialog in `workspace`,
 * as far as the file header allows: a session folder is seeded outright, a
 * project folder only inherits what the user already accepted under another
 * account. `config` is the already-resolved host agent config of the agent
 * about to launch. Best-effort: failures log and the dialog shows once.
 */
export async function seedAgentWorkspaceTrust(
	db: HostDb,
	workspace: { worktreePath: string; projectId: string | null },
	config: { presetId: string; command: string; env: Record<string, string> },
	listTrustStores: (
		family: TrustFamily,
	) => Promise<string[]> = discoverTrustStores,
): Promise<void> {
	try {
		const target = resolveTrustTarget(db, config);
		if (target === null) return;
		const folderPath = normalizeFolderPath(workspace.worktreePath);
		if (workspace.projectId === null) {
			await FOLDER_TRUST[target.family].seed(target.file, folderPath);
			return;
		}
		const project = db
			.select({ repoPath: projects.repoPath })
			.from(projects)
			.where(eq(projects.id, workspace.projectId))
			.get();
		const folderPaths = [
			...new Set([
				folderPath,
				...(project ? [normalizeFolderPath(project.repoPath)] : []),
			]),
		];
		await carryFolderTrust(
			target.family,
			target.file,
			() => listTrustStores(target.family),
			folderPaths,
		);
	} catch (err) {
		console.warn(
			`[agents.run] failed to pre-trust workspace folder '${workspace.worktreePath}' for agent '${config.presetId}':`,
			err,
		);
	}
}
