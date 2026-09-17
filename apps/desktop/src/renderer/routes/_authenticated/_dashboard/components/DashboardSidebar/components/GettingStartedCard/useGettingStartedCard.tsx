import { useLingui } from "@lingui/react/macro";
import { useRef, useState } from "react";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import type { SidebarCardEntry } from "renderer/components/SidebarCardSlot/types";
import { useCreateAgentSession } from "renderer/hooks/useCreateAgentSession";
import { useGettingStartedStore } from "renderer/stores/getting-started";
import { GettingStartedChecklist } from "./components/GettingStartedChecklist";
import { GETTING_STARTED_STEPS } from "./constants";

export function useGettingStartedCard(): SidebarCardEntry | null {
	const { t } = useLingui();
	const { tried, dismissed, markTried, dismiss } = useGettingStartedStore();
	const { createSession } = useCreateAgentSession();
	const { gateFeature, hasAccess, isReady } = usePaywall();
	const [pendingStep, setPendingStep] = useState<number | null>(null);
	const busy = useRef(false);
	const start = async (index: number) => {
		const step = GETTING_STARTED_STEPS[index];
		if (!step || busy.current) return;
		busy.current = true;
		setPendingStep(index);
		try {
			if (await createSession(step.prompt)) markTried(step.progressIndex);
		} finally {
			busy.current = false;
			setPendingStep(null);
		}
	};
	if (dismissed || !isReady || !hasAccess(GATED_FEATURES.REMOTE_ACCESS))
		return null;
	return {
		id: "pro-getting-started",
		title: t({ message: "Get the best out of Pro" }),
		onDismiss: dismiss,
		children: (
			<GettingStartedChecklist
				tried={tried}
				pendingStep={pendingStep}
				onStart={(index) => {
					const step = GETTING_STARTED_STEPS[index];
					if (step) gateFeature(step.feature, () => start(index));
				}}
			/>
		),
	};
}
