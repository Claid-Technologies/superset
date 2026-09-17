import { msg } from "@lingui/core/macro";
import { COMPANY } from "@superset/shared/constants";
import { GATED_FEATURES } from "renderer/components/Paywall";

export const GETTING_STARTED_STEPS = [
	{
		progressIndex: 1,
		label: msg({ message: "Enable remote access" }),
		feature: GATED_FEATURES.REMOTE_ACCESS,
		prompt:
			"Help me set up remote access with Superset Pro so I can reach my workspaces from another device. Start with `superset hosts --help` and inspect the available hosts. Ask which machine I want to access, explain the account and organization requirements, and guide me through the supported remote-access settings. Explain what must stay running and any sleep or wake requirements. Check host reachability, then help me verify access from the other device. Do not change network or power settings without explaining the change and getting my approval. If access is unavailable, identify what is missing.",
	},
	{
		progressIndex: 0,
		label: msg({ message: "Use Superset on mobile" }),
		feature: GATED_FEATURES.MOBILE_APP,
		prompt: `Help me use Superset Pro on my phone. Ask which phone I use. For iPhone, guide me to the official Superset app at ${COMPANY.APP_STORE_URL}, then help me sign in to the same account and organization as the desktop app. For other devices, check current official availability rather than promising support. Use the superset CLI (start with superset hosts --help) to inspect available hosts, explain how to keep my development machine reachable, and guide me through opening an existing workspace from my phone. Ask me to verify that I can see it; do not claim the phone is connected without confirmation.`,
	},
	{
		progressIndex: 2,
		label: msg({ message: "Set up an automation" }),
		feature: GATED_FEATURES.AUTOMATIONS,
		prompt:
			"Help me create a Superset Pro automation. Use the superset:automate skill if available, otherwise the `superset` CLI (start with `superset automations --help`). Ask what I want to run on a schedule; suggest a morning update, recurring issue triage, or a code review if I need ideas. Confirm the schedule, timezone, target project, host, and agent, then create the automation and trigger a first run so we can review the result together. Explain where I can change the schedule or pause it.",
	},
] as const;
