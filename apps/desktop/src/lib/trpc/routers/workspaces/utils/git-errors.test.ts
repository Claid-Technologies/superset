import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import {
	classifyEnvironmentalGitError,
	GitEnvironmentError,
	NotGitRepoError,
	rethrowEnvironmentalGitError,
} from "./git-errors";

// simple-git's GitError carries git's stderr verbatim as the message.
const CWD_PERMISSION =
	"fatal: Unable to read current working directory: Operation not permitted\n";
const CWD_GONE =
	"fatal: Unable to read current working directory: No such file or directory\n";
const NOT_A_REPO =
	"fatal: not a git repository (or any of the parent directories): .git\n";
// Node's spawn failure when no PATH entry holds a git binary, in both shapes
// the git paths produce: execFile rejects with the bare message, while
// simple-git stringifies the same error — stack included — into a GitError.
const SPAWN_ENOENT_EXEC_FILE = "spawn git ENOENT";
const SPAWN_ENOENT_SIMPLE_GIT =
	"Error: spawn git ENOENT\n    at ChildProcess._handle.onexit (node:internal/child_process:287:19)\n    at onErrorNT (node:internal/child_process:508:16)\n    at process.processTicksAndRejections (node:internal/process/task_queues:90:21)";

describe("classifyEnvironmentalGitError", () => {
	test("maps cwd-unreadable variants to GitEnvironmentError", () => {
		for (const message of [CWD_PERMISSION, CWD_GONE]) {
			const classified = classifyEnvironmentalGitError(new Error(message));
			expect(classified).toBeInstanceOf(GitEnvironmentError);
			expect(classified?.message).toBe(message);
		}
	});

	test("maps not-a-repository to NotGitRepoError", () => {
		const classified = classifyEnvironmentalGitError(new Error(NOT_A_REPO));
		expect(classified).toBeInstanceOf(NotGitRepoError);
		expect(classified?.message).toBe(NOT_A_REPO);
	});

	test("maps an unspawnable git to GitEnvironmentError", () => {
		for (const message of [SPAWN_ENOENT_EXEC_FILE, SPAWN_ENOENT_SIMPLE_GIT]) {
			const classified = classifyEnvironmentalGitError(new Error(message));
			expect(classified).toBeInstanceOf(GitEnvironmentError);
			expect(classified?.message).toBe(message);
		}
	});

	test("leaves other ENOENT failures reporting as bugs", () => {
		for (const message of [
			// A file a task read vanished mid-task; git itself ran fine.
			"ENOENT: no such file or directory, open '/repo/.git/HEAD'",
			// Some other binary is missing — a git subprocess we don't own.
			"spawn git-lfs ENOENT",
			// The phrase quoted inside a larger failure, not the spawn itself.
			"fatal: could not read 'spawn git ENOENT' from config",
			// git ran and relayed the words from something it invoked — a hook
			// that could not spawn its own git. That hook is the failure, not
			// this command's environment.
			"fatal: pre-commit hook failed\nspawn git ENOENT\n",
		]) {
			expect(classifyEnvironmentalGitError(new Error(message))).toBeNull();
		}
	});

	test("returns null for genuine unexpected failures", () => {
		expect(
			classifyEnvironmentalGitError(new Error("fatal: bad revision 'HEAD~1'")),
		).toBeNull();
		expect(classifyEnvironmentalGitError("string error")).toBeNull();
	});
});

describe("rethrowEnvironmentalGitError", () => {
	function capture(error: unknown): TRPCError | null {
		try {
			rethrowEnvironmentalGitError(error);
			return null;
		} catch (thrown) {
			return thrown as TRPCError;
		}
	}

	function causeKind(thrown: TRPCError | null): string | undefined {
		return (thrown?.cause as { kind?: string } | undefined)?.kind;
	}

	test("throws PRECONDITION_FAILED for cwd-unreadable messages", () => {
		const thrown = capture(new Error(CWD_PERMISSION));
		expect(thrown?.code).toBe("PRECONDITION_FAILED");
		expect(causeKind(thrown)).toBe("GIT_ENVIRONMENT");
		expect(thrown?.message).toBe(CWD_PERMISSION);
	});

	test("throws PRECONDITION_FAILED when git cannot be spawned", () => {
		const thrown = capture(new Error(SPAWN_ENOENT_SIMPLE_GIT));
		expect(thrown?.code).toBe("PRECONDITION_FAILED");
		expect(causeKind(thrown)).toBe("GIT_ENVIRONMENT");
	});

	test("throws BAD_REQUEST for not-a-repository messages", () => {
		const thrown = capture(new Error(NOT_A_REPO));
		expect(thrown?.code).toBe("BAD_REQUEST");
		expect(causeKind(thrown)).toBe("NOT_GIT_REPO");
	});

	test("matches worker-serialized domain errors by name", () => {
		const crossedBoundary = new Error("Failed to get git status: timeout");
		crossedBoundary.name = "GitEnvironmentError";
		expect(capture(crossedBoundary)?.code).toBe("PRECONDITION_FAILED");
	});

	test("no-ops for TRPCErrors and genuine failures", () => {
		expect(
			capture(new TRPCError({ code: "BAD_REQUEST", message: NOT_A_REPO })),
		).toBeNull();
		expect(capture(new Error("fatal: bad revision 'HEAD~1'"))).toBeNull();
	});
});
