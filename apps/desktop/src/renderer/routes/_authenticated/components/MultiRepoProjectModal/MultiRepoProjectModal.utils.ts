export interface SelectedFolder {
	path: string;
	name: string;
}

const MAX_FOLDER_NAME_LENGTH = 64;

/**
 * Mirrors `sanitizeFolderName` on the host, so the row shows the name the
 * server will store rather than one that changes on create.
 */
export function folderNameForPath(path: string): string {
	const base = path.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
	const name = base
		.replace(/[^A-Za-z0-9._-]/g, "-")
		.replace(/^[^A-Za-z0-9]+/, "")
		.slice(0, MAX_FOLDER_NAME_LENGTH);
	return name || "repo";
}

export function appendFolder(
	folders: SelectedFolder[],
	path: string,
): SelectedFolder[] {
	const taken = new Set(folders.map((folder) => folder.name));
	const base = folderNameForPath(path);
	let name = base;
	let suffix = 2;
	while (taken.has(name)) {
		name = `${base}-${suffix}`;
		suffix += 1;
	}
	return [...folders, { path, name }];
}

export function removeFolder(
	folders: SelectedFolder[],
	path: string,
): SelectedFolder[] {
	return folders.filter((folder) => folder.path !== path);
}
