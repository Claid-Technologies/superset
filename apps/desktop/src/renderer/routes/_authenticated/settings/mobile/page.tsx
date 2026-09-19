import { FEATURE_FLAGS } from "@superset/shared/constants";
import { createFileRoute } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { Redirect } from "renderer/components/Redirect";
import { MobileSettings } from "./components/MobileSettings";

export const Route = createFileRoute("/_authenticated/settings/mobile/")({
	component: MobileSettingsPage,
});

function MobileSettingsPage() {
	const enabled = useFeatureFlagEnabled(FEATURE_FLAGS.MOBILE_LAUNCH);
	if (enabled === undefined) return null;
	if (!enabled) return <Redirect to="/settings/account" replace />;
	return <MobileSettings />;
}
