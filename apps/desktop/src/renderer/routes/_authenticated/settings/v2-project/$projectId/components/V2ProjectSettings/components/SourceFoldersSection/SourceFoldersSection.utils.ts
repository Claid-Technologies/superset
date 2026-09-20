import type { ProjectFolder } from "./types";

/** Optimistic mirror of `project.folders.setPrimary`. */
export function withPrimaryFolder(
	folders: ProjectFolder[],
	folderId: string,
): ProjectFolder[] {
	const target = folders.find((folder) => folder.id === folderId);
	if (!target) return folders;
	return [target, ...folders.filter((folder) => folder.id !== folderId)].map(
		(folder, position) => ({ ...folder, position }),
	);
}

/** Optimistic mirror of `project.folders.remove`, which closes the gap. */
export function withoutFolder(
	folders: ProjectFolder[],
	folderId: string,
): ProjectFolder[] {
	return folders
		.filter((folder) => folder.id !== folderId)
		.map((folder, position) => ({ ...folder, position }));
}
