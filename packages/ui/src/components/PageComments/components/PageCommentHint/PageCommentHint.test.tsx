import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PageCommentHint } from "./PageCommentHint";

function render(props: { watching: boolean; agentId: string | null }): string {
	return renderToStaticMarkup(
		<PageCommentHint {...props} onDismiss={() => {}} />,
	);
}

describe("PageCommentHint", () => {
	it("promises a republish when a named agent is watching", () => {
		const markup = render({ watching: true, agentId: "claude" });

		expect(markup).toContain("claude");
		expect(markup).toContain("is watching");
		expect(markup).toContain("republish the page");
		expect(markup).not.toContain("No agent is watching");
	});

	it("promises a republish when an unnamed agent is watching", () => {
		const markup = render({ watching: true, agentId: null });

		expect(markup).toContain("An agent is watching");
		expect(markup).toContain("republish the page");
		expect(markup).not.toContain("No agent is watching");
	});

	it("promises nothing when no agent is watching", () => {
		const markup = render({ watching: false, agentId: null });

		expect(markup).toContain("No agent is watching");
		expect(markup).toContain("recorded for whoever published the page");
		expect(markup).not.toContain("republish the page");
	});

	it("promises nothing when the heartbeat went stale under a named agent", () => {
		const markup = render({ watching: false, agentId: "claude" });

		expect(markup).toContain("No agent is watching");
		expect(markup).not.toContain("claude");
		expect(markup).not.toContain("republish the page");
	});

	it("always tells the reader that clicking is what starts a comment", () => {
		for (const watching of [true, false]) {
			expect(render({ watching, agentId: null })).toContain(
				"Click anything on this page to comment on it.",
			);
		}
	});
});
