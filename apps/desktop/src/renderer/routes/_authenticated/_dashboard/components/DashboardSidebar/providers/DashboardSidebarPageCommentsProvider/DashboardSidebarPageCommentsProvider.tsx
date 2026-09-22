import { createContext, type ReactNode, useContext, useMemo } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

const WAITING_REFETCH_INTERVAL_MS = 60_000;
const WAITING_STALE_TIME_MS = 30_000;

const DashboardSidebarPageCommentsContext = createContext<Map<
	string,
	number
> | null>(null);

export function DashboardSidebarPageCommentsProvider({
	children,
}: {
	children: ReactNode;
}) {
	const organizationId = useActiveOrganizationId();
	const { data } = cloudTrpc.pageComment.waitingByWorkspace.useQuery(
		undefined,
		{
			enabled: organizationId !== null,
			refetchInterval: WAITING_REFETCH_INTERVAL_MS,
			staleTime: WAITING_STALE_TIME_MS,
		},
	);

	const waitingByWorkspaceId = useMemo(
		() =>
			new Map(
				(data ?? []).map((row) => [row.workspaceId, row.waitingCount] as const),
			),
		[data],
	);

	return (
		<DashboardSidebarPageCommentsContext.Provider value={waitingByWorkspaceId}>
			{children}
		</DashboardSidebarPageCommentsContext.Provider>
	);
}

export function useWorkspacePageCommentsWaiting(workspaceId: string): number {
	return useContext(DashboardSidebarPageCommentsContext)?.get(workspaceId) ?? 0;
}
