"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { usePageWatch } from "../../../../hooks/usePageWatch";

interface PageWatchBadgeProps {
	slug: string;
	initialWatching: boolean;
	initialAgentId: string | null;
}

export function PageWatchBadge({
	slug,
	initialWatching,
	initialAgentId,
}: PageWatchBadgeProps) {
	const watch = usePageWatch(slug, {
		watching: initialWatching,
		agentId: initialAgentId,
	});

	if (!watch.watching) return null;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="flex items-center gap-1.5 text-muted-foreground text-xs">
					<span className="relative flex size-1.5">
						<span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
						<span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
					</span>
					<span className="hidden sm:inline">
						{watch.agentId
							? `${watch.agentId} is watching`
							: "An agent is watching"}
					</span>
				</span>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				New comments on this page are sent to the agent as you leave them.
			</TooltipContent>
		</Tooltip>
	);
}
