import { isPaidPlanTier } from "@superset/shared/billing";
import { useRef } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useCurrentPlan } from "renderer/hooks/useCurrentPlan";
import type { GatedFeature } from "./constants";
import { paywall } from "./Paywall";

export function usePaywall() {
	const { plan: userPlan, isReady, resolvePlanWhenKnown } = useCurrentPlan();
	// Read at the top level, not inside gateFeature: hooks may not be called
	// from a callback, and the paywall must be attributed to the org THIS
	// window is showing.
	const organizationId = useActiveOrganizationId();
	// Features whose gate is still resolving the plan. A second click during
	// that window is dropped rather than queued: the caller's own pending
	// state only flips once its callback has started, so without this a
	// double-click on a cold start could create two automations or dispatch
	// two runs.
	const resolving = useRef(new Set<GatedFeature>());

	function hasAccess(feature: GatedFeature): boolean {
		void feature;
		return isPaidPlanTier(userPlan);
	}

	function gateFeature(
		feature: GatedFeature,
		callback: () => void | Promise<void>,
		context?: Record<string, unknown>,
	): void {
		if (resolving.current.has(feature)) return;
		resolving.current.add(feature);
		void (async () => {
			try {
				const plan = await resolvePlanWhenKnown();
				if (plan === null) return;
				if (isPaidPlanTier(plan)) {
					try {
						await callback();
					} catch (error) {
						console.error(`[paywall] Callback error for ${feature}:`, error);
					}
					return;
				}
				paywall(feature, {
					organizationId,
					userPlan: plan,
					...context,
				});
			} finally {
				resolving.current.delete(feature);
			}
		})();
	}

	return {
		hasAccess,
		gateFeature,
		userPlan,
		isReady,
	};
}
