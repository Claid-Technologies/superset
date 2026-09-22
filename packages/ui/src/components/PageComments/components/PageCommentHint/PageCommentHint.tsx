"use client";

import { Trans } from "@lingui/react/macro";
import { MousePointerClick } from "lucide-react";
import { Button } from "../../../ui/button";

interface PageCommentHintProps {
	watching: boolean;
	onDismiss: () => void;
}

export function PageCommentHint({ watching, onDismiss }: PageCommentHintProps) {
	return (
		<div className="flex h-9 shrink-0 items-center justify-center gap-3 border-b bg-muted/40 px-3 text-xs">
			<span className="flex min-w-0 items-center gap-1.5 truncate text-muted-foreground">
				<MousePointerClick className="size-3.5 shrink-0" />
				{watching ? (
					<Trans>
						Click anything on this page to comment on it. An agent is watching,
						and will pick your comment up and republish the page.
					</Trans>
				) : (
					<Trans>
						Click anything on this page to comment on it. No agent is watching
						right now, so your comment is saved on the page.
					</Trans>
				)}
			</span>

			<Button
				className="shrink-0"
				size="xs"
				variant="ghost"
				onClick={onDismiss}
			>
				<Trans>Got it</Trans>
			</Button>
		</div>
	);
}
