const PAGE_COMMENT_HINT_KEY = "superset-page-comment-hint-v1";

export function hasSeenPageCommentHint(): boolean {
	try {
		return window.localStorage.getItem(PAGE_COMMENT_HINT_KEY) !== null;
	} catch {
		return true;
	}
}

export function rememberPageCommentHint(): void {
	try {
		window.localStorage.setItem(PAGE_COMMENT_HINT_KEY, "seen");
	} catch {
		// localStorage unavailable; the hint shows again next visit
	}
}
