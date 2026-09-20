import type { RouterOutputs } from "@superset/trpc";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";

export type OrgPage = RouterOutputs["page"]["list"]["items"][number];
export type PulledPage = RouterOutputs["page"]["pull"];

export const NO_PAGES: OrgPage[] = [];

const PAGES_PER_REQUEST = 200;

async function fetchAllPages(
	filter: { workspaceId?: string },
	signal?: AbortSignal,
): Promise<OrgPage[]> {
	const items: OrgPage[] = [];
	let cursor: { updatedAt: string; id: string } | undefined;
	do {
		const result = await apiClient.page.list.query(
			{ limit: PAGES_PER_REQUEST, ...filter, ...(cursor ? { cursor } : {}) },
			{ signal },
		);
		items.push(...result.items);
		cursor = result.nextCursor ?? undefined;
	} while (cursor);
	return items;
}

export function usePagesQuery(): UseQueryResult<OrgPage[]> {
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;

	return useQuery({
		queryKey: ["cloud", "page", "list", organizationId],
		enabled: organizationId !== null,
		queryFn: ({ signal }) => fetchAllPages({}, signal),
		staleTime: 30_000,
	});
}

export function useWorkspacePagesQuery(
	workspaceId: string | null,
): UseQueryResult<OrgPage[]> {
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;

	return useQuery({
		queryKey: ["cloud", "page", "list", organizationId, workspaceId],
		enabled: organizationId !== null && workspaceId !== null,
		queryFn: ({ signal }) =>
			fetchAllPages({ workspaceId: workspaceId ?? "" }, signal),
		staleTime: 30_000,
	});
}

const PULLED_PAGE_STALE_MS = 5 * 60_000;

export function usePageQuery(slug: string): UseQueryResult<PulledPage> {
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;

	return useQuery({
		queryKey: ["cloud", "page", "pull", organizationId, slug],
		queryFn: () => apiClient.page.pull.query({ slug }),
		enabled: Boolean(slug),
		staleTime: PULLED_PAGE_STALE_MS,
		retry: false,
	});
}
