/**
 * Everything the box needs to be one workspace, assembled in one place so a
 * create, a wake and a restart after promote all hand the box the same thing:
 * its identity file, the credential rules for the firewall, the managed
 * environment to push after boot, and the host secret for the boot command.
 */
import type { cloudWorkspaces } from "@superset/db/schema";
import {
	type CloudAgentLaunch,
	cloudAgentLaunchToEnv,
} from "@superset/shared/cloud-agent-launch";
import {
	SANDBOX_CONTRACT_VERSION,
	type SandboxIdentity,
} from "@superset/shared/sandbox-contract";
import { env } from "../../env";
import { resolveAgentCredentialEnv } from "../../router/agent-credential";
import { resolveEnvironment } from "../../router/environment/resolve-environment";
import { sandboxHostSecretFor } from "./access";
import { resolveCloneTarget } from "./clone-token";
import { cloudRepo } from "./cloud-repo";
import { deriveSandboxCredentials } from "./credentials";
import { mergeHooks, readRepoHooks } from "./repo-hooks";
import type { SandboxClaim, SandboxEnvironment } from "./vercel";

type CloudWorkspaceRow = typeof cloudWorkspaces.$inferSelect;

export async function buildSandboxClaim(args: {
	row: CloudWorkspaceRow;
	launch?: CloudAgentLaunch;
	/**
	 * Read the repository's own hooks too. Only a create needs them (ports
	 * are fixed once the box exists), and it costs a GitHub request.
	 */
	withRepoHooks?: boolean;
}): Promise<{
	claim: SandboxClaim;
	environment: SandboxEnvironment;
	repoUrl: string;
}> {
	const [environment, repo, userAgentEnv] = await Promise.all([
		resolveEnvironment(args.row.environmentId, args.row.organizationId),
		cloudRepo(),
		args.row.createdByUserId
			? resolveAgentCredentialEnv({ userId: args.row.createdByUserId })
			: Promise.resolve({}),
	]);
	if (!environment) throw new Error("Environment not found");
	if (!repo) throw new Error("No repository to clone");
	const clone = await resolveCloneTarget(repo);
	if (!clone) throw new Error("No repository to clone");
	const repoHooks = args.withRepoHooks
		? await readRepoHooks({ repo, branch: args.row.branch, token: clone.token })
		: null;
	const hooks = mergeHooks(repoHooks, environment.hooks);

	const identity: SandboxIdentity = {
		SUPERSET_SANDBOX_CONTRACT: String(SANDBOX_CONTRACT_VERSION) as "1",
		SUPERSET_API_URL: env.NEXT_PUBLIC_API_URL,
		SUPERSET_SANDBOX_WORKSPACE_ID: args.row.id,
		SUPERSET_SANDBOX_ORGANIZATION_ID: args.row.organizationId,
		SUPERSET_SANDBOX_REPO_URL: clone.cloneUrl,
		SUPERSET_SANDBOX_BRANCH: args.row.branch,
		SUPERSET_SANDBOX_IMAGE_TAG: environment.sourceRef,
		SUPERSET_SANDBOX_PROVIDER: args.row.provider,
		...(environment.bundleSha
			? { SUPERSET_BUNDLE_SHA: environment.bundleSha }
			: {}),
		...(environment.hooks
			? { SUPERSET_SANDBOX_HOOKS: JSON.stringify(environment.hooks) }
			: {}),
		...(env.SENTRY_DSN_SANDBOX
			? {
					HOST_SERVICE_SENTRY_DSN: env.SENTRY_DSN_SANDBOX,
					HOST_SERVICE_SENTRY_ENVIRONMENT:
						env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
				}
			: {}),
		...(cloudAgentLaunchToEnv(args.launch) as Partial<SandboxIdentity>),
	};
	const { networkPolicy, managedEnv } = deriveSandboxCredentials({
		environmentEnv: environment.envs,
		userAgentEnv,
		githubToken: clone.token,
	});
	return {
		claim: {
			identity,
			hostSecret: await sandboxHostSecretFor(args.row.id),
			managedEnv,
			networkPolicy,
			ports: hooks.ports,
		},
		environment: {
			sourceKind: environment.sourceKind,
			sourceRef: environment.sourceRef,
		},
		repoUrl: clone.cloneUrl,
	};
}
