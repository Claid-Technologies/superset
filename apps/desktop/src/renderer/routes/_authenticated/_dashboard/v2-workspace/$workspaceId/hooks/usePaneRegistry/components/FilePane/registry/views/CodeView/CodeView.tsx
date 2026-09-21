import { useCallback, useEffect, useMemo, useRef } from "react";
import {
	createPaneScrollStateKey,
	getPaneScrollState,
	savePaneScrollState,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/state/paneScrollStateCache";
import { detectLanguage } from "shared/detect-language";
import type { ViewProps } from "../../types";
import { CodeEditor } from "./components/CodeEditor";
import type { CodeEditorAdapter } from "./components/CodeEditor/CodeEditorAdapter";

export function CodeView({
	document,
	filePath,
	workspaceId,
	pendingPosition,
	onPositionRevealed,
}: ViewProps) {
	const editorRef = useRef<CodeEditorAdapter | null>(null);
	useEffect(() => {
		if (
			document.content.kind !== "text" ||
			!pendingPosition ||
			!editorRef.current
		)
			return;
		editorRef.current.revealPosition(
			pendingPosition.line,
			pendingPosition.column,
		);
		onPositionRevealed?.();
	}, [pendingPosition, onPositionRevealed, document.content.kind]);
	// Quick Open replaces preview panes with new pane IDs, so the file path is
	// the stable editor identity when a user switches away and back.
	const scrollStateKey = useMemo(
		() =>
			createPaneScrollStateKey({
				workspaceId,
				viewId: "editor",
				resourceId: filePath,
			}),
		[workspaceId, filePath],
	);
	const initialScrollPosition = useMemo(
		() => getPaneScrollState(scrollStateKey),
		[scrollStateKey],
	);
	const handleScrollPositionChange = useCallback(
		(position: { scrollTop: number; scrollLeft: number }) => {
			savePaneScrollState(scrollStateKey, position);
		},
		[scrollStateKey],
	);

	if (document.content.kind !== "text") {
		return null;
	}

	return (
		<CodeEditor
			key={document.id}
			value={document.content.value}
			language={detectLanguage(filePath)}
			onChange={(next) => document.setContent(next)}
			onSave={() => void document.save()}
			editorRef={editorRef}
			initialScrollPosition={
				pendingPosition ? undefined : initialScrollPosition
			}
			onScrollPositionChange={handleScrollPositionChange}
			fillHeight
		/>
	);
}
