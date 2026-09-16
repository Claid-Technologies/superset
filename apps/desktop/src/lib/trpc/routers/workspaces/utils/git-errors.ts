import { TRPCError } from "@trpc/server";

/**
 * A git operation failed because of the user's environment — a worktree
 * deleted outside the app, a pathological working tree (e.g. a home directory
 * registered as a repo), a cold network volume — not because of a bug.
 * Callers treat these as degraded states and translate them into non-500
 * TRPCErrors at the router boundary, which is what keeps them out of Sentry —
 * the middleware reports on status code alone and has no allowlist. Matching
 * is by `name` because the git worker's serialization strips prototypes.
 */
export class GitEnvironmentError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "GitEnvironmentError";
	}
}

export class NotGitRepoError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "NotGitRepoError";
	}
}

// Git's own text for environmental failures: the worktree was deleted out
// from under a running git process or macOS denies reading it ("Unable to
// read current working directory: No such file or directory" / "Operation
// not permitted"), or the directory is not a repository.
const CWD_UNREADABLE_PATTERN = /unable to read current working directory/i;
const NOT_GIT_REPO_PATTERN = /not a git repository/i;
// Node's own text when no PATH entry holds a git binary — git is not installed,
// or the login shell we derive PATH from resolves none. Every git command fails
// identically until that is fixed. Matched on the message rather than
// `code === "ENOENT"` because simple-git rebuilds the spawn failure as a
// GitError carrying only the stringified original, so the code is gone by the
// time we see it; that stringification is also why the line can arrive with an
// `Error: ` prefix and a stack below it. Anchoring the whole line keeps this off
// an ENOENT from a file a task read and off other binaries git spawns.
const GIT_UNSPAWNABLE_PATTERN = /^(?:Error: )?spawn git ENOENT$/m;

/**
 * Classifies a raw git failure (simple-git GitError, exec stderr) into the
 * domain errors above by message. Returns null for anything else so genuine
 * unexpected git failures keep reporting as bugs.
 */
export function classifyEnvironmentalGitError(
	error: unknown,
): NotGitRepoError | GitEnvironmentError | null {
	if (!(error instanceof Error)) return null;
	if (NOT_GIT_REPO_PATTERN.test(error.message)) {
		return new NotGitRepoError(error.message);
	}
	if (
		CWD_UNREADABLE_PATTERN.test(error.message) ||
		GIT_UNSPAWNABLE_PATTERN.test(error.message)
	) {
		return new GitEnvironmentError(error.message);
	}
	return null;
}

/**
 * Boundary catch for procedures that run simple-git in-process: rethrows
 * environmental git failures as the same typed non-500 TRPCErrors the worker
 * paths produce (see branches.ts/status.ts); no-op for anything else. Domain
 * errors are matched by name because worker serialization strips prototypes.
 */
export function rethrowEnvironmentalGitError(error: unknown): void {
	if (error instanceof TRPCError || !(error instanceof Error)) return;
	if (
		error.name === "NotGitRepoError" ||
		NOT_GIT_REPO_PATTERN.test(error.message)
	) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: error.message,
			cause: { kind: "NOT_GIT_REPO" },
		});
	}
	if (
		error.name === "GitEnvironmentError" ||
		CWD_UNREADABLE_PATTERN.test(error.message) ||
		GIT_UNSPAWNABLE_PATTERN.test(error.message)
	) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: error.message,
			cause: { kind: "GIT_ENVIRONMENT" },
		});
	}
}
