"use client";

import { PageCommentHint } from "@superset/ui/page-comments";
import { useEffect, useState } from "react";
import { usePageWatch } from "../../hooks/usePageWatch";
import {
	hasSeenPageCommentHint,
	rememberPageCommentHint,
} from "./utils/pageCommentHintSeen";

interface PageCommentHintBarProps {
	slug: string;
	initialWatching: boolean;
	initialAgentId: string | null;
}

export function PageCommentHintBar({
	slug,
	initialWatching,
	initialAgentId,
}: PageCommentHintBarProps) {
	const [visible, setVisible] = useState(false);
	const watch = usePageWatch(slug, {
		watching: initialWatching,
		agentId: initialAgentId,
	});

	useEffect(() => {
		setVisible(!hasSeenPageCommentHint());
	}, []);

	if (!visible) return null;

	return (
		<PageCommentHint
			watching={watch.watching}
			agentId={watch.agentId}
			onDismiss={() => {
				rememberPageCommentHint();
				setVisible(false);
			}}
		/>
	);
}
