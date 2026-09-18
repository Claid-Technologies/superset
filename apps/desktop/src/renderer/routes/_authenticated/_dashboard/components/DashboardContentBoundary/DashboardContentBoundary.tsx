import { CatchBoundary, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { DashboardContentError } from "../DashboardContentError";

export function DashboardContentBoundary({
	children,
}: {
	children: ReactNode;
}) {
	const loadedAt = useRouterState({ select: (state) => state.loadedAt });
	return (
		<CatchBoundary
			getResetKey={() => loadedAt}
			errorComponent={DashboardContentError}
		>
			{children}
		</CatchBoundary>
	);
}
