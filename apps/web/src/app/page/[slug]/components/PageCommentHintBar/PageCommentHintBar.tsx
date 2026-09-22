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
}

export function PageCommentHintBar({
	slug,
	initialWatching,
}: PageCommentHintBarProps) {
	const [visible, setVisible] = useState(false);
	const { watching } = usePageWatch(slug, {
		watching: initialWatching,
		agentId: null,
	});

	useEffect(() => {
		setVisible(!hasSeenPageCommentHint());
	}, []);

	if (!visible) return null;

	return (
		<PageCommentHint
			watching={watching}
			onDismiss={() => {
				rememberPageCommentHint();
				setVisible(false);
			}}
		/>
	);
}
