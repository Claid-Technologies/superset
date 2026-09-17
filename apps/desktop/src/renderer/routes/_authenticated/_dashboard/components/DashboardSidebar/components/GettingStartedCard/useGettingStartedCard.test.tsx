import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GATED_FEATURES } from "renderer/components/Paywall/constants";

let paid = true;
let isReady = true;
let dismissed = false;
let allowed = true;
let gateResult: Promise<void> | undefined;
const createSession = mock(async (_prompt: string) => true);
const markTried = mock((_step: number) => {});
const gateFeature = mock((_feature: string, start: () => Promise<void>) => {
	if (allowed) gateResult = start();
});

mock.module("renderer/components/Paywall", () => ({
	GATED_FEATURES,
	usePaywall: () => ({ hasAccess: () => paid, isReady, gateFeature }),
}));
mock.module("renderer/hooks/useCreateAgentSession", () => ({
	useCreateAgentSession: () => ({ createSession }),
}));
mock.module("renderer/stores/getting-started", () => ({
	useGettingStartedStore: () => ({
		tried: 0,
		dismissed,
		markTried,
		dismiss: () => {},
	}),
}));

const { useGettingStartedCard } = await import("./useGettingStartedCard");
let card: ReturnType<typeof useGettingStartedCard>;
function Probe() {
	card = useGettingStartedCard();
	return null;
}
function start(index: number) {
	const child = card?.children as ReactElement<{
		onStart: (step: number) => void;
	}>;
	child.props.onStart(index);
	return gateResult;
}

beforeEach(() => {
	paid = true;
	isReady = true;
	dismissed = false;
	allowed = true;
	gateResult = undefined;
	createSession.mockReset();
	createSession.mockResolvedValue(true);
	markTried.mockClear();
	gateFeature.mockClear();
});

describe("Pro getting-started card", () => {
	test("shows for paid plans only after billing resolves, and honors dismissal", () => {
		renderToStaticMarkup(<Probe />);
		expect(card).not.toBeNull();
		paid = false;
		renderToStaticMarkup(<Probe />);
		expect(card).toBeNull();
		paid = true;
		isReady = false;
		renderToStaticMarkup(<Probe />);
		expect(card).toBeNull();
		isReady = true;
		dismissed = true;
		renderToStaticMarkup(<Probe />);
		expect(card).toBeNull();
	});
	test("uses each Pro entitlement and records only successfully created sessions", async () => {
		renderToStaticMarkup(<Probe />);
		for (const [index, feature] of [
			GATED_FEATURES.MOBILE_APP,
			GATED_FEATURES.REMOTE_ACCESS,
			GATED_FEATURES.AUTOMATIONS,
		].entries()) {
			await start(index);
			expect(gateFeature).toHaveBeenLastCalledWith(
				feature,
				expect.any(Function),
			);
			expect(markTried).toHaveBeenLastCalledWith(index);
		}
		expect(createSession.mock.calls[0]?.[0]).toContain(
			"https://apps.apple.com/app/id6788926383",
		);
		expect(createSession.mock.calls[1]?.[0]).toContain("superset hosts --help");
		expect(createSession.mock.calls[2]?.[0]).toContain("superset:automate");
		markTried.mockClear();
		createSession.mockResolvedValue(false);
		await start(0);
		expect(markTried).not.toHaveBeenCalled();
	});
	test("does not launch when entitlement is revoked before the click", async () => {
		renderToStaticMarkup(<Probe />);
		allowed = false;
		await start(1);
		expect(createSession).not.toHaveBeenCalled();
		expect(markTried).not.toHaveBeenCalled();
	});
});
