interface FreshRead<Value> {
	value: Value;
	// The query cache outlives a sign-out, so a value read at mount can belong
	// to the previous account. Only a read that landed after mount counts.
	isFresh: boolean;
}

interface ResolveInitialWindowOrganizationInput {
	windowOrganization: FreshRead<string | null | undefined>;
	memberOrganizationIds: FreshRead<readonly string[] | null | undefined>;
	sessionOrganizationId: string | null | undefined;
}

type InitialWindowOrganization =
	| { status: "waiting" }
	| { status: "resolved"; organizationId: string };

export function resolveInitialWindowOrganization({
	windowOrganization,
	memberOrganizationIds,
	sessionOrganizationId,
}: ResolveInitialWindowOrganizationInput): InitialWindowOrganization {
	if (!windowOrganization.isFresh) return { status: "waiting" };
	const windowOrganizationId = windowOrganization.value ?? null;

	if (windowOrganizationId != null) {
		if (!memberOrganizationIds.isFresh || memberOrganizationIds.value == null) {
			return { status: "waiting" };
		}
		if (memberOrganizationIds.value.includes(windowOrganizationId)) {
			return { status: "resolved", organizationId: windowOrganizationId };
		}
	}

	return sessionOrganizationId
		? { status: "resolved", organizationId: sessionOrganizationId }
		: { status: "waiting" };
}
