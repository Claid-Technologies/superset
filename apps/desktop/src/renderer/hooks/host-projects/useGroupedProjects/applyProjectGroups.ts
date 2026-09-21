import {
	collectSourceFolderOnlyProjectIds,
	type HostProjectGroup,
	indexProjectGroupsByPrimaryProjectId,
} from "renderer/hooks/host-projects/useHostProjectGroups/useHostProjectGroups.utils";

export type GroupedProject<Project> = Project & {
	groupId: string | null;
	repoCount: number;
};

/**
 * The id a grouped list renders a project under: a source folder resolves to
 * the Project that owns it, since `applyProjectGroups` drops the folder's own
 * row.
 */
export function resolvePrimaryProjectId(
	groups: HostProjectGroup[],
	projectId: string,
): string {
	if (indexProjectGroupsByPrimaryProjectId(groups).has(projectId)) {
		return projectId;
	}
	const owner = groups.find((group) =>
		group.members.some((member) => member.projectId === projectId),
	);
	const primary = owner?.members.find((member) => member.position === 0);
	return primary?.projectId ?? projectId;
}

export function applyProjectGroups<
	Project extends { id: string; name: string },
>(projects: Project[], groups: HostProjectGroup[]): GroupedProject<Project>[] {
	const groupByPrimaryProjectId = indexProjectGroupsByPrimaryProjectId(groups);
	const sourceFolderOnlyProjectIds = collectSourceFolderOnlyProjectIds(groups);

	return projects.flatMap((project): GroupedProject<Project>[] => {
		if (sourceFolderOnlyProjectIds.has(project.id)) return [];
		const group = groupByPrimaryProjectId.get(project.id);
		if (!group) return [{ ...project, groupId: null, repoCount: 1 }];
		return [
			{
				...project,
				name: group.name,
				groupId: group.id,
				repoCount: group.members.length,
			},
		];
	});
}
