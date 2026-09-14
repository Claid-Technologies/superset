import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import type { CloudAgentLaunch } from "@superset/shared/cloud-agent-launch";
import { and, eq, isNull } from "drizzle-orm";
import { nudge } from "../../lib/realtime";
import {
	buildSandboxClaim,
	deleteSandbox,
	provisionSandbox,
	SandboxNotReadyError,
	settleSandbox,
} from "../../lib/sandbox";
import { generateCloudWorkspaceName } from "./generate-name";
import { transitionCloudWorkspace } from "./transition";

export const FALLBACK_NAME = "Cloud workspace";

/** Derived from the row id so the name is stable and collision-free. */
export function sandboxNameFor(cloudWorkspaceId: string): string {
	return `ws-${cloudWorkspaceId.replaceAll("-", "").slice(0, 24)}`;
}

export interface ProvisionCloudWorkspaceInput {
	cloudWorkspaceId: string;
	/**
	 * Set only when the user didn't type a name, in which case the row holds
	 * `FALLBACK_NAME` and this is what the workspace gets named from.
	 */
	namingPrompt?: string;
	/** A built-in agent to run once the sandbox is up; see cloud-agent-launch. */
	launch?: CloudAgentLaunch;
}

export type ProvisionCloudWorkspaceOutcome =
	| "provisioned"
	| "skipped"
	| "failed";

/**
 * Everything a cloud workspace needs after its row exists: a sandbox with
 * its identity written and boot started, the `ready` status that makes it
 * openable, and the managed environment pushed once host-service answers.
 *
 * Runs detached from the create that asked for it, so it owns the row's
 * terminal state: it must leave `ready` or `failed` behind. The name is
 * generated alongside, off the sandbox's critical path: the box never
 * learns it, the API's row is what carries it.
 *
 * Safe to run twice on the same row: the provider calls are create-if-missing
 * and an already-`ready` row is left alone.
 */
export async function provisionCloudWorkspace(
	input: ProvisionCloudWorkspaceInput,
): Promise<ProvisionCloudWorkspaceOutcome> {
	const row = await db.query.cloudWorkspaces.findFirst({
		where: eq(cloudWorkspaces.id, input.cloudWorkspaceId),
	});
	if (!row) return "skipped";
	if (row.status !== "provisioning") return "skipped";

	const providerSandboxId = sandboxNameFor(row.id);
	const provisionStartedAt = new Date();
	const naming =
		input.namingPrompt === undefined
			? Promise.resolve()
			: generateCloudWorkspaceName(input.namingPrompt).then(
					async (generated) => {
						if (!generated || generated === row.name) return;
						await db
							.update(cloudWorkspaces)
							.set({ name: generated })
							.where(eq(cloudWorkspaces.id, row.id));
						nudge(row.organizationId, "cloud_workspaces");
					},
				);
	try {
		const { claim, environment } = await buildSandboxClaim({
			row,
			launch: input.launch,
			withRepoHooks: true,
		});
		const sandbox = await provisionSandbox({
			name: providerSandboxId,
			environment,
			claim,
		});
		const ready = await transitionCloudWorkspace({
			id: row.id,
			from: ["provisioning"],
			to: "ready",
			set: {
				providerSandboxId: sandbox.providerSandboxId,
				sandboxUrl: sandbox.sandboxUrl,
				provisionStartedAt,
				...sandbox.stamps,
			},
		});
		if (!ready) {
			// Deleted while the box was being made: the delete won the row, so
			// the box it never knew about goes with it.
			await deleteSandbox(providerSandboxId);
			await naming.catch(() => {});
			return "skipped";
		}
		nudge(row.organizationId, "cloud_workspaces");
		// The box is booting; the environment it needs arrives once host-service
		// answers. The client's own wake pushes it again, so a workspace nobody
		// opens still gets it (an agent launched at boot waits for this).
		const { healthyAt } = await settleSandbox({
			providerSandboxId,
			hostTarget: sandbox.hostTarget,
			claim,
		});
		await db
			.update(cloudWorkspaces)
			.set({ firstHealthyAt: healthyAt })
			.where(
				and(
					eq(cloudWorkspaces.id, row.id),
					isNull(cloudWorkspaces.firstHealthyAt),
				),
			);
		await naming.catch((error) =>
			console.error(`[cloud-workspace] naming failed for ${row.id}`, error),
		);
		return "provisioned";
	} catch (error) {
		await naming.catch(() => {});
		// A box that booted but whose host-service never answered stays up for
		// diagnosis: its desktop is reachable and its boot log says what
		// happened, and a delete from the sidebar still removes it. Any other
		// failure must not leak a box, since billing started at provision.
		const keepForDiagnosis = error instanceof SandboxNotReadyError;
		if (!keepForDiagnosis) {
			await deleteSandbox(providerSandboxId).catch((teardownError) => {
				console.error(
					`[cloud-workspace] leaked sandbox ${providerSandboxId}`,
					teardownError,
				);
			});
		}
		await transitionCloudWorkspace({
			id: row.id,
			from: ["provisioning", "ready"],
			to: "failed",
			set: keepForDiagnosis ? { providerSandboxId } : {},
		});
		nudge(row.organizationId, "cloud_workspaces");
		console.error(`[cloud-workspace] provisioning failed for ${row.id}`, error);
		return "failed";
	}
}
