import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useFramePointerDown } from "@superset/ui/page-comments";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { formatDistanceToNowStrict } from "date-fns";
import { Bot, Check, EyeOff } from "lucide-react";
import { useCallback, useState } from "react";
import { usePageWatchers } from "renderer/hooks/host-service/usePageWatchers";
import { useTerminalAgentBindings } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";

const WATCHING_REFRESH_MS = 30_000;
const IDLE_REFRESH_MS = 5 * 60_000;

interface PageWatcherMenuProps {
	workspaceId: string;
	pageId: string | undefined;
	pageTitle: string;
	pageSlug: string;
}

export function PageWatcherMenu({
	workspaceId,
	pageId,
	pageTitle,
	pageSlug,
}: PageWatcherMenuProps) {
	const { t } = useLingui();
	const bindings = useTerminalAgentBindings(workspaceId);
	const watchers = usePageWatchers(workspaceId);
	const cloudUtils = cloudTrpc.useUtils();
	const assign = workspaceTrpc.pageWatch.assign.useMutation();
	const unwatch = workspaceTrpc.pageWatch.unwatch.useMutation();
	const [menuOpen, setMenuOpen] = useState(false);

	useFramePointerDown(useCallback(() => setMenuOpen(false), []));

	const cloudWatch = cloudTrpc.page.get.useQuery(
		{ id: pageId ?? "" },
		{
			enabled: Boolean(pageId),
			refetchInterval: (query) =>
				query.state.data?.watch.watching
					? WATCHING_REFRESH_MS
					: IDLE_REFRESH_MS,
		},
	);

	const watcher = pageId ? watchers.get(pageId) : undefined;
	const elsewhere =
		!watcher && cloudWatch.data?.watch.watching === true
			? cloudWatch.data.watch
			: null;

	const running = [...bindings.values()]
		.filter((binding) => !binding.endedAt)
		.sort((a, b) => b.lastEventAt - a.lastEventAt);

	if (!pageId) return null;

	const label = (terminalId: string) => {
		const binding = bindings.get(terminalId);
		return binding?.definitionId ?? binding?.agentId ?? terminalId.slice(0, 8);
	};

	const watch = (terminalId: string, agentId: string | null) => {
		assign.mutate(
			{
				pageId,
				slug: pageSlug,
				title: pageTitle,
				workspaceId,
				terminalId,
				agentId,
			},
			{
				onSettled: () => cloudUtils.page.get.invalidate({ id: pageId }),
				onError: (error) =>
					toast.error(
						t({
							message: "Could not watch this page",
						}),
						{ description: errorMessage(error) },
					),
			},
		);
	};

	const stop = () => {
		unwatch.mutate(
			{ pageId },
			{
				onSettled: () => cloudUtils.page.get.invalidate({ id: pageId }),
				onError: (error) =>
					toast.error(
						t({
							message: "Could not stop watching",
						}),
						{ description: errorMessage(error) },
					),
			},
		);
	};

	return (
		<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="h-6 gap-1 px-1.5 text-muted-foreground/60 text-xs hover:text-muted-foreground"
					aria-label={t({
						message: "Choose which agent watches this page for comments",
					})}
					disabled={assign.isPending || unwatch.isPending}
				>
					{watcher || elsewhere ? (
						<>
							<StatusIndicator status="working" />
							<span className="max-w-24 truncate">
								{watcher
									? (watcher.agentId ?? label(watcher.terminalId))
									: (elsewhere?.agentId ??
										t({
											message: "An agent",
											context: "page watcher with no known name",
										}))}
							</span>
						</>
					) : (
						<Bot className="size-4" />
					)}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-64">
				<DropdownMenuLabel className="font-normal text-muted-foreground text-xs">
					{watcher ? (
						<Trans>Comments go to this agent</Trans>
					) : elsewhere ? (
						<Trans>Watched by an agent in another workspace</Trans>
					) : (
						<Trans>Nothing is watching this page</Trans>
					)}
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{running.length === 0 ? (
					<DropdownMenuItem disabled>
						<Trans>No agents running here</Trans>
					</DropdownMenuItem>
				) : (
					running.map((binding) => {
						const current = watcher?.terminalId === binding.terminalId;
						return (
							<DropdownMenuItem
								key={binding.terminalId}
								onSelect={() =>
									watch(binding.terminalId, binding.definitionId ?? null)
								}
								className="gap-2"
							>
								{current ? (
									<Check className="size-4 text-muted-foreground" />
								) : (
									<Bot className="size-4 text-muted-foreground" />
								)}
								<div className="flex min-w-0 flex-col">
									<span className="truncate text-sm">
										{binding.definitionId ?? binding.agentId}
									</span>
									<span className="text-muted-foreground text-xs">
										<Trans>
											active{" "}
											{formatDistanceToNowStrict(binding.lastEventAt, {
												addSuffix: true,
											})}
										</Trans>
									</span>
								</div>
							</DropdownMenuItem>
						);
					})
				)}
				{watcher ? (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem onSelect={stop} className="gap-2">
							<EyeOff className="size-4 text-muted-foreground" />
							<Trans>Stop watching</Trans>
						</DropdownMenuItem>
					</>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
