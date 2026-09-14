import { useCallback, useEffect, useRef } from "react";
import type { CloudWorkspaceRow } from "renderer/hooks/useCloudWorkspaces";
import { track } from "renderer/lib/analytics";
import {
	CLOUD_WORKSPACE_OPENED_EVENT,
	type CloudWorkspaceOpenTimeline,
	cloudWorkspaceOpenedProperties,
	takeCloudWorkspaceCreateStart,
} from "renderer/lib/cloud-workspace-open-timeline";
import { subscribeTerminalAttached } from "renderer/lib/terminal/terminal-attach-events";
import type { SandboxTarget } from "renderer/routes/_authenticated/providers/SandboxAccessProvider";

/**
 * A workspace with nothing to attach (no terminal pane) still reports its
 * open; the terminal stage is simply absent.
 */
const TERMINAL_GRACE_MS = 30_000;

function sameHost(a: string, b: string): boolean {
	try {
		return new URL(a).host === new URL(b).host;
	} catch {
		return false;
	}
}

/**
 * Emits `cloud_workspace_opened` once per open of a cloud workspace, with
 * how long each stage took as seen from this desktop: the create (when this
 * desktop sent it) to the row turning `ready`, `ready` to the sandbox
 * answering its wake, to the first host-service response, and to the first
 * terminal attaching. The API's own stamps ride along off the row.
 */
export function useCloudWorkspaceOpenedEvent(args: {
	workspaceId: string;
	cloudWorkspace: CloudWorkspaceRow | null;
	sandbox: SandboxTarget | null;
	/** True once the sandbox's host-service has served this workspace. */
	hostAnswered: boolean;
}): void {
	const { workspaceId, cloudWorkspace, sandbox, hostAnswered } = args;
	const timelineRef = useRef<CloudWorkspaceOpenTimeline | null>(null);
	const rowRef = useRef(cloudWorkspace);
	rowRef.current = cloudWorkspace;
	const emittedRef = useRef(false);
	const graceTimerRef = useRef<number | null>(null);

	const emit = useCallback(() => {
		const timeline = timelineRef.current;
		if (!timeline || emittedRef.current) return;
		emittedRef.current = true;
		if (graceTimerRef.current !== null) {
			window.clearTimeout(graceTimerRef.current);
			graceTimerRef.current = null;
		}
		track(
			CLOUD_WORKSPACE_OPENED_EVENT,
			cloudWorkspaceOpenedProperties(timeline, rowRef.current ?? undefined),
		);
	}, []);

	useEffect(() => {
		timelineRef.current = null;
		emittedRef.current = false;
		return () => {
			if (graceTimerRef.current !== null) {
				window.clearTimeout(graceTimerRef.current);
				graceTimerRef.current = null;
			}
		};
	}, []);

	useEffect(() => {
		if (!cloudWorkspace || cloudWorkspace.id !== workspaceId) return;
		const now = Date.now();
		if (!timelineRef.current) {
			const createStartedAt = takeCloudWorkspaceCreateStart(workspaceId);
			const kind = createStartedAt === null ? "reopen" : "create";
			timelineRef.current = {
				workspaceId,
				kind,
				createStartedAt,
				openedAt: now,
				// A reopen starts from a row that is already ready; its wait is
				// the wake, measured from the route mounting.
				readyAt:
					kind === "reopen" && cloudWorkspace.status === "ready" ? now : null,
				accessAt: null,
				firstResponseAt: null,
				firstTerminalAt: null,
			};
		}
		const timeline = timelineRef.current;
		if (cloudWorkspace.status === "ready" && timeline.readyAt === null) {
			timeline.readyAt = now;
		}
	}, [cloudWorkspace, workspaceId]);

	useEffect(() => {
		const timeline = timelineRef.current;
		if (!timeline || !sandbox?.running || timeline.accessAt !== null) return;
		timeline.accessAt = Date.now();
	}, [sandbox]);

	useEffect(() => {
		const timeline = timelineRef.current;
		if (!timeline || !hostAnswered || timeline.firstResponseAt !== null) return;
		timeline.firstResponseAt = Date.now();
		graceTimerRef.current = window.setTimeout(emit, TERMINAL_GRACE_MS);
	}, [hostAnswered, emit]);

	useEffect(() => {
		if (!sandbox) return;
		const sandboxUrl = sandbox.url;
		return subscribeTerminalAttached((url) => {
			const timeline = timelineRef.current;
			if (!timeline || timeline.firstTerminalAt !== null) return;
			if (!sameHost(url, sandboxUrl)) return;
			timeline.firstTerminalAt = Date.now();
			if (timeline.firstResponseAt === null) {
				timeline.firstResponseAt = timeline.firstTerminalAt;
			}
			emit();
		});
	}, [sandbox, emit]);
}
