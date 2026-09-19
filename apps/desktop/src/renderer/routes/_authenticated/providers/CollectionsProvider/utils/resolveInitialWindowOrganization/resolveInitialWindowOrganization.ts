interface InitialRead<Value> {
	value: Value;
	// The query cache outlives a sign-out, so a value read at mount can belong
	// to the previous account. Only a read that landed after mount counts.
	isFresh: boolean;
	hasFailed: boolean;
}

interface ResolveInitialWindowOrganizationInput {
	windowOrganization: InitialRead<string | null | undefined>;
	memberOrganizationIds: InitialRead<readonly string[] | null | undefined>;
	sessionOrganizationId: string | null | undefined;
}

type InitialWindowOrganization =
	| { status: "waiting" }
	| { status: "failed" }
	| { status: "resolved"; organizationId: string };

const awaiting = (read: InitialRead<unknown>): InitialWindowOrganization =>
	read.hasFailed ? { status: "failed" } : { status: "waiting" };

export function resolveInitialWindowOrganization({
	windowOrganization,
	memberOrganizationIds,
	sessionOrganizationId,
}: ResolveInitialWindowOrganizationInput): InitialWindowOrganization {
	if (!windowOrganization.isFresh) return awaiting(windowOrganization);
	const windowOrganizationId = windowOrganization.value ?? null;

	if (windowOrganizationId != null) {
		if (!memberOrganizationIds.isFresh || memberOrganizationIds.value == null) {
			return awaiting(memberOrganizationIds);
		}
		if (memberOrganizationIds.value.includes(windowOrganizationId)) {
			return { status: "resolved", organizationId: windowOrganizationId };
		}
	}

	return sessionOrganizationId
		? { status: "resolved", organizationId: sessionOrganizationId }
		: { status: "waiting" };
}
