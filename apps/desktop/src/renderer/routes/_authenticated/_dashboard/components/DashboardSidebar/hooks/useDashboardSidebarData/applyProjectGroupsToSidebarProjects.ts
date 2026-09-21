import {
	collectSourceFolderOnlyProjectIds,
	type HostProjectGroup,
	indexProjectGroupsByPrimaryProjectId,
} from "renderer/hooks/host-projects/useHostProjectGroups/useHostProjectGroups.utils";

export type GroupedSidebarProject<Project> = Project & {
	groupId: string | null;
	repoCount: number;
};

export function applyProjectGroupsToSidebarProjects<
	Project extends { id: string; name: string },
>(
	projects: Project[],
	groups: HostProjectGroup[],
): GroupedSidebarProject<Project>[] {
	const groupByPrimaryProjectId = indexProjectGroupsByPrimaryProjectId(groups);
	const sourceFolderOnlyProjectIds = collectSourceFolderOnlyProjectIds(groups);

	return projects.flatMap((project): GroupedSidebarProject<Project>[] => {
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
