import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PageCommentHint } from "./PageCommentHint";

function render(props: { watching: boolean }): string {
	return renderToStaticMarkup(
		<PageCommentHint {...props} onDismiss={() => {}} />,
	);
}

describe("PageCommentHint", () => {
	it("promises a republish when an agent is watching", () => {
		const markup = render({ watching: true });

		expect(markup).toContain("An agent is watching");
		expect(markup).toContain("republish the page");
		expect(markup).not.toContain("No agent is watching");
	});

	it("promises nothing when no agent is watching", () => {
		const markup = render({ watching: false });

		expect(markup).toContain("No agent is watching");
		expect(markup).toContain("saved on the page");
		expect(markup).not.toContain("republish the page");
	});

	it("claims no delivery when no agent is watching", () => {
		const markup = render({ watching: false });

		for (const promise of [
			"recorded for",
			"published the page",
			"pick your comment up",
			"sent to",
			"notified",
		]) {
			expect(markup).not.toContain(promise);
		}
	});

	it("never names the watching agent", () => {
		expect(render({ watching: true })).not.toContain("claude");
	});

	it("always tells the reader that clicking is what starts a comment", () => {
		for (const watching of [true, false]) {
			expect(render({ watching })).toContain(
				"Click anything on this page to comment on it.",
			);
		}
	});
});
