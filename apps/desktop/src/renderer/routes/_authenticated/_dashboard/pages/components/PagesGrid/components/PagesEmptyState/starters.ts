// Request text reaches the agent verbatim, so it stays English like the rest
// of buildPageAgentPrompt; the labels beside it are the interface copy.
export type PageStarterId =
	| "change-walkthrough"
	| "design-options"
	| "incident-timeline"
	| "status-report"
	| "proposal";

export const PAGE_STARTER_REQUESTS: Record<PageStarterId, string> = {
	"change-walkthrough":
		"A walkthrough of a change: what it does, why it was made, the parts worth reviewing, and anything still open. Ask me which pull request, branch, or diff to cover.",
	"design-options":
		"Two or three design options side by side, each with its rationale and tradeoffs, so a reader can pick one. Ask me what we are deciding and what the options are.",
	"incident-timeline":
		"An investigation writeup: a timeline of what happened, what caused it, what fixed it, and what we are changing. Ask me which incident and where the evidence lives.",
	"status-report":
		"A status report for people outside the work: what shipped, what is in flight, what is blocked, and the numbers that matter. Ask me what period it covers and who reads it.",
	proposal:
		"A proposal or design doc: the problem, the proposed approach, alternatives considered, risks, and what happens next. Ask me what I am proposing and who decides.",
};

export const PAGE_STARTER_IDS = Object.keys(
	PAGE_STARTER_REQUESTS,
) as PageStarterId[];
