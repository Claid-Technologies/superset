import { beforeEach, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GATED_FEATURES } from "renderer/components/Paywall/constants";

const router = await import("@tanstack/react-router");
let paid = true;
let ready = true;
let tried = 0;
mock.module("renderer/components/Paywall", () => ({
	GATED_FEATURES,
	usePaywall: () => ({
		hasAccess: () => paid,
		isReady: ready,
		gateFeature: () => {},
	}),
}));
mock.module("renderer/stores/getting-started", () => ({
	useGettingStartedStore: () => ({ tried, markTried: () => {} }),
}));
mock.module("@tanstack/react-router", () => ({
	...router,
	Link: ({ children, to }: { children: ReactNode; to: string }) =>
		createElement("a", { href: to }, children),
}));
const { MobileSettings } = await import("../MobileSettings");
beforeEach(() => {
	paid = true;
	ready = true;
	tried = 0;
});
test("shows the official download QR and setup confirmation for paid users", () => {
	const html = renderToStaticMarkup(<MobileSettings />);
	expect(html).toContain("Scan to download Superset for iPhone");
	expect(html).toContain("https://apps.apple.com/app/id6788926383");
	expect(html).toContain("/settings/security");
	expect(html).toContain("signed in on my phone");
});
test("withholds QR and confirmation from free and unresolved plans", () => {
	paid = false;
	let html = renderToStaticMarkup(<MobileSettings />);
	expect(html).toContain("Upgrade to Pro");
	expect(html).not.toContain("https://apps.apple.com/app/id6788926383");
	expect(html).not.toContain("signed in on my phone");
	paid = true;
	ready = false;
	html = renderToStaticMarkup(<MobileSettings />);
	expect(html).not.toContain("https://apps.apple.com/app/id6788926383");
	expect(html).not.toContain("signed in on my phone");
});
test("shows confirmed setup only after explicit mobile confirmation", () => {
	tried = 1;
	expect(renderToStaticMarkup(<MobileSettings />)).toContain(
		"Mobile setup confirmed",
	);
});
