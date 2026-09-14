type TerminalAttachedListener = (url: string) => void;

const listeners = new Set<TerminalAttachedListener>();

/** Fires with the socket URL each time a terminal's session attaches. */
export function subscribeTerminalAttached(
	listener: TerminalAttachedListener,
): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function notifyTerminalAttached(url: string | null): void {
	if (!url) return;
	for (const listener of listeners) listener(url);
}
