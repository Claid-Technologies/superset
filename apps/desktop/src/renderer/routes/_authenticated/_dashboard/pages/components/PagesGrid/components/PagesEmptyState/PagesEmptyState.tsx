import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { LuPlus } from "react-icons/lu";
import { PagePreview } from "./components/PagePreview";
import {
	PAGE_STARTER_IDS,
	PAGE_STARTER_REQUESTS,
	type PageStarterId,
} from "./starters";

interface PagesEmptyStateProps {
	onCreate: (request?: string) => void;
	isCreating: boolean;
}

export function PagesEmptyState({
	onCreate,
	isCreating,
}: PagesEmptyStateProps) {
	const { t } = useLingui();

	const starterLabels: Record<PageStarterId, string> = {
		"change-walkthrough": t({ message: "Walk through a change" }),
		"design-options": t({ message: "Compare design options" }),
		"incident-timeline": t({ message: "Build an incident timeline" }),
		"status-report": t({ message: "Write a status report" }),
		proposal: t({ message: "Draft a proposal" }),
	};

	return (
		<div className="mx-auto my-auto flex w-full max-w-md flex-col gap-5 py-10">
			<PagePreview />

			<div className="flex flex-col gap-1.5">
				<h2 className="font-medium text-lg tracking-tight">
					<Trans>No pages yet</Trans>
				</h2>
				<p className="text-muted-foreground text-sm/relaxed">
					<Trans>
						One self-contained document, opened by link. Your agent publishes
						it, teammates pin comments to it, and the agent republishes with the
						fixes.
					</Trans>
				</p>
			</div>

			<div className="flex flex-col gap-2">
				<p className="font-medium text-muted-foreground text-xs">
					<Trans>Start your agent on one of these</Trans>
				</p>
				<div className="flex flex-wrap gap-2">
					{PAGE_STARTER_IDS.map((id) => (
						<Button
							key={id}
							size="xs"
							variant="outline"
							disabled={isCreating}
							onClick={() => onCreate(PAGE_STARTER_REQUESTS[id])}
						>
							{starterLabels[id]}
						</Button>
					))}
				</div>
			</div>

			<div className="flex items-center gap-3 border-border/60 border-t pt-4">
				<Button size="sm" onClick={() => onCreate()} disabled={isCreating}>
					<LuPlus className="size-3.5" />
					<Trans>Create with AI</Trans>
				</Button>
				<span className="text-muted-foreground text-xs">
					<Trans>Or describe your own in the workspace that opens.</Trans>
				</span>
			</div>
		</div>
	);
}
