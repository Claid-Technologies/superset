import { resolveCurrentPlan } from "@superset/shared/billing";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useActiveOrganizationId } from "./useActiveOrganizationId";

export function useCurrentPlan() {
	const { data: session } = authClient.useSession();
	const organizationId = useActiveOrganizationId();
	const utils = cloudTrpc.useUtils();
	const { data: activePlan } = cloudTrpc.billing.activePlan.useQuery(undefined);
	const isReady = activePlan !== undefined;
	const sessionFallback = {
		organizationId,
		sessionOrganizationId: session?.session?.activeOrganizationId,
		sessionPlan: session?.session?.plan,
	};
	const plan = resolveCurrentPlan({
		...sessionFallback,
		subscriptionPlan: activePlan?.plan,
		subscriptionsLoaded: isReady,
	});

	async function resolvePlanWhenKnown() {
		if (isReady) return plan;
		try {
			const fetched = await utils.billing.activePlan.ensureData();
			return resolveCurrentPlan({
				...sessionFallback,
				subscriptionPlan: fetched?.plan,
				subscriptionsLoaded: true,
			});
		} catch (error) {
			console.warn("[billing] Failed to fetch active plan:", error);
			if (
				!organizationId ||
				organizationId !== sessionFallback.sessionOrganizationId
			) {
				return null;
			}
			return resolveCurrentPlan({
				...sessionFallback,
				subscriptionsLoaded: false,
			});
		}
	}

	return { plan, isReady, activePlan, resolvePlanWhenKnown };
}
