import { db } from "@superset/db/client";
import { connections, githubInstallations } from "@superset/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { verifyOrgMembership } from "./utils";

/**
 * Connectors whose deliveries are dispatched to one member's automations
 * rather than the organization's. Another member's Google account is not this
 * caller's to trigger on, so it must not read as connected for them. Every
 * other connector routes by workspace, and fires for everyone in the org.
 */
const PER_MEMBER_CONNECTORS = new Set(["google"]);

/**
 * Which integrations this caller can actually build a trigger on.
 *
 * One procedure rather than the seven per-provider queries the settings pane
 * makes, because the trigger editor asks on every render of every row and
 * polls while the page is open. Two queries answer all of them: the
 * organization's live connections, and the GitHub installation, which lives in
 * its own table.
 *
 * "Connected" means the same thing here as everywhere else — a row marked
 * disconnected is not connected — so this stays in step with the per-provider
 * `getConnection` procedures.
 */
export const connectionStatusProcedure = protectedProcedure
	.input(z.object({ organizationId: z.uuid() }))
	.query(async ({ ctx, input }): Promise<Record<string, boolean>> => {
		await verifyOrgMembership(ctx.session.user.id, input.organizationId);

		const [connectorRows, installation] = await Promise.all([
			db.query.connections.findMany({
				where: and(
					eq(connections.organizationId, input.organizationId),
					isNull(connections.disconnectedAt),
				),
				columns: { connector: true, connectedByUserId: true },
			}),
			db.query.githubInstallations.findFirst({
				where: eq(githubInstallations.organizationId, input.organizationId),
				columns: { suspended: true },
			}),
		]);

		const connected: Record<string, boolean> = {};
		for (const row of connectorRows) {
			if (
				PER_MEMBER_CONNECTORS.has(row.connector) &&
				row.connectedByUserId !== ctx.session.user.id
			)
				continue;
			connected[row.connector] = true;
		}

		// A suspended installation still has a row, and delivers nothing.
		connected.github = installation !== undefined && !installation.suspended;

		return connected;
	});
