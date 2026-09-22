import fs from "node:fs";

/**
 * Idempotent, atomic file write. Skips the write when content is unchanged
 * (callers rely on this to keep re-provisioning from churning mtimes), and
 * writes via temp-file + rename otherwise. Atomicity matters because several
 * provisioners can run concurrently on one machine (the desktop plus one CLI
 * host-service per org), and some targets are user-owned configs
 * (~/.claude/settings.json) where a torn write would break the user's agent
 * until they repair it by hand — the managed-hooks merge skips unparseable
 * files rather than rewriting them.
 *
 * Every write resolves symlinks first, because rename never follows the last
 * path component: renaming onto ~/.claude/settings.json when it is a link
 * into a dotfiles repo would replace the link with a regular file and the two
 * copies would silently drift from then on. Resolving also keeps the temp
 * file beside its real target, so a link across filesystems still renames.
 */
export function writeFileIfChanged(
	filePath: string,
	content: string,
	mode: number,
): boolean {
	let target: string;
	try {
		target = fs.realpathSync(filePath);
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		// Absent, dangling, or cyclic: no inode to write through, so the path
		// itself is ours to claim. Anything else (a directory we cannot
		// traverse, a parent that is not a directory) is a real problem the
		// caller should see rather than have us write past.
		if (code !== "ENOENT" && code !== "ELOOP") {
			throw error;
		}
		target = filePath;
	}

	const existing = fs.existsSync(target)
		? fs.readFileSync(target, "utf-8")
		: null;
	if (existing === content) {
		try {
			fs.chmodSync(target, mode);
		} catch {
			// Best effort.
		}
		return false;
	}

	const tmpPath = `${target}.${process.pid}.tmp`;
	try {
		fs.writeFileSync(tmpPath, content, { mode });
		fs.renameSync(tmpPath, target);
	} catch (error) {
		try {
			fs.unlinkSync(tmpPath);
		} catch {
			// Best effort.
		}
		throw error;
	}
	try {
		fs.chmodSync(target, mode);
	} catch {
		// Best effort.
	}
	return true;
}
