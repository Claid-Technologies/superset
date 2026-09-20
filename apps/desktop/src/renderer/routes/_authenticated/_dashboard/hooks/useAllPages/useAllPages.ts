import { useEffect, useMemo } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

const PAGES_PER_BATCH = 200;

export interface PagesListFilter {
	workspaceId?: string;
	search?: string;
}

export function pagesListInput(filter: PagesListFilter = {}) {
	return { limit: PAGES_PER_BATCH, ...filter };
}

export function useAllPages(
	filter: PagesListFilter = {},
	options: { enabled?: boolean; staleTime?: number } = {},
) {
	const query = cloudTrpc.page.list.useInfiniteQuery(pagesListInput(filter), {
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		...options,
	});

	const {
		hasNextPage,
		isFetchingNextPage,
		isFetchNextPageError,
		fetchNextPage,
	} = query;

	useEffect(() => {
		if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) {
			void fetchNextPage();
		}
	}, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

	const items = useMemo(
		() => query.data?.pages.flatMap((page) => page.items) ?? [],
		[query.data],
	);

	return { ...query, items, isIncomplete: isFetchNextPageError };
}
