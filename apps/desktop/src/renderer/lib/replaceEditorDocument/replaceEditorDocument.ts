import {
	EditorSelection,
	type EditorState,
	findClusterBreak,
	type TransactionSpec,
} from "@codemirror/state";

function clusterBoundaryAtOrBefore(text: string, pos: number): number {
	const before = findClusterBreak(text, pos, false);
	return findClusterBreak(text, before, true) === pos ? pos : before;
}

export function replaceEditorDocument(
	state: EditorState,
	value: string,
): TransactionSpec {
	const head = Math.min(state.selection.main.head, value.length);
	return {
		changes: { from: 0, to: state.doc.length, insert: value },
		selection: EditorSelection.cursor(clusterBoundaryAtOrBefore(value, head)),
	};
}
