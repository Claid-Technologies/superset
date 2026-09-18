import {
	EditorSelection,
	type EditorState,
	type TransactionSpec,
} from "@codemirror/state";

export function replaceEditorDocument(
	state: EditorState,
	value: string,
): TransactionSpec {
	return {
		changes: { from: 0, to: state.doc.length, insert: value },
		selection: EditorSelection.cursor(
			Math.min(state.selection.main.head, value.length),
		),
	};
}
