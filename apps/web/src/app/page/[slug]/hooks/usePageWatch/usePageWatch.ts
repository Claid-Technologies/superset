"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";

const WATCHING_REFRESH_MS = 30_000;
const IDLE_REFRESH_MS = 5 * 60_000;

export interface PageWatchSnapshot {
	watching: boolean;
	agentId: string | null;
}

export function usePageWatch(
	slug: string,
	initial: PageWatchSnapshot,
): PageWatchSnapshot {
	const trpc = useTRPC();
	const { data } = useQuery({
		...trpc.page.get.queryOptions({ slug }),
		refetchInterval: (query) =>
			(query.state.data?.watch.watching ?? initial.watching)
				? WATCHING_REFRESH_MS
				: IDLE_REFRESH_MS,
		refetchIntervalInBackground: false,
	});

	return data?.watch ?? initial;
}
