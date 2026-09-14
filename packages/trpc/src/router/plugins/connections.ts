import { db } from "@superset/db/client";
import { pluginInstalls, pluginMarketplaces } from "@superset/db/schema";
import {
	DEFAULT_MARKETPLACE,
	DEFAULT_MARKETPLACE_REF,
	DEFAULT_MARKETPLACE_REPO,
} from "@superset/shared/plugins";
import { and, asc, countDistinct, eq } from "drizzle-orm";
import type { PluginManifest } from "./manifest";

export interface InstalledPlugin {
	id: string;
	manifest: PluginManifest;
	marketplace: string;
}

export class AmbiguousPluginError extends Error {
	constructor(
		readonly pluginName: string,
		readonly marketplaces: string[],
	) {
		super(
			`"${pluginName}" is installed from more than one marketplace (${marketplaces.join(", ")}). Name one with plugin@marketplace.`,
		);
	}
}

export async function installedPlugin(
	userId: string,
	pluginName: string,
	marketplace?: string,
): Promise<InstalledPlugin | null> {
	const rows = await db
		.select({
			id: pluginInstalls.id,
			manifest: pluginInstalls.manifest,
			marketplace: pluginInstalls.marketplace,
		})
		.from(pluginInstalls)
		.where(
			and(
				eq(pluginInstalls.userId, userId),
				eq(pluginInstalls.pluginName, pluginName),
				eq(pluginInstalls.enabled, true),
				marketplace ? eq(pluginInstalls.marketplace, marketplace) : undefined,
			),
		)
		.orderBy(asc(pluginInstalls.marketplace))
		.limit(2);

	if (rows.length > 1) {
		throw new AmbiguousPluginError(
			pluginName,
			rows.map((entry) => entry.marketplace),
		);
	}

	const row = rows[0];
	if (!row) return null;
	return {
		id: row.id,
		manifest: row.manifest as PluginManifest,
		marketplace: row.marketplace,
	};
}

export async function installRecord(
	userId: string,
	pluginName: string,
	marketplace?: string,
): Promise<{ id: string; marketplace: string; siblings: number } | null> {
	const rows = await db
		.select({
			id: pluginInstalls.id,
			marketplace: pluginInstalls.marketplace,
		})
		.from(pluginInstalls)
		.where(
			and(
				eq(pluginInstalls.userId, userId),
				eq(pluginInstalls.pluginName, pluginName),
				marketplace ? eq(pluginInstalls.marketplace, marketplace) : undefined,
			),
		)
		.orderBy(asc(pluginInstalls.marketplace));

	if (rows.length > 1) {
		throw new AmbiguousPluginError(
			pluginName,
			rows.map((entry) => entry.marketplace),
		);
	}

	const row = rows[0];
	if (!row) return null;

	const [{ count } = { count: 0 }] = await db
		.select({ count: countDistinct(pluginInstalls.id) })
		.from(pluginInstalls)
		.where(
			and(
				eq(pluginInstalls.userId, userId),
				eq(pluginInstalls.pluginName, pluginName),
			),
		);

	return { id: row.id, marketplace: row.marketplace, siblings: count };
}

export async function installById(
	userId: string,
	installId: string,
): Promise<InstalledPlugin | null> {
	const [row] = await db
		.select({
			id: pluginInstalls.id,
			manifest: pluginInstalls.manifest,
			marketplace: pluginInstalls.marketplace,
		})
		.from(pluginInstalls)
		.where(
			and(
				eq(pluginInstalls.id, installId),
				eq(pluginInstalls.userId, userId),
				eq(pluginInstalls.enabled, true),
			),
		)
		.limit(1);

	if (!row) return null;
	return {
		id: row.id,
		manifest: row.manifest as PluginManifest,
		marketplace: row.marketplace,
	};
}

export async function installedManifest(
	userId: string,
	pluginName: string,
	marketplace?: string,
): Promise<PluginManifest | null> {
	return (
		(await installedPlugin(userId, pluginName, marketplace))?.manifest ?? null
	);
}

export interface BundledSource {
	repo: string;
	ref: string;
}

export async function bundledSource(
	userId: string,
	marketplace: string,
): Promise<BundledSource | null> {
	const [row] = await db
		.select()
		.from(pluginMarketplaces)
		.where(
			and(
				eq(pluginMarketplaces.userId, userId),
				eq(pluginMarketplaces.name, marketplace),
			),
		)
		.limit(1);

	if (!row) {
		return marketplace === DEFAULT_MARKETPLACE
			? { repo: DEFAULT_MARKETPLACE_REPO, ref: DEFAULT_MARKETPLACE_REF }
			: null;
	}
	if (row.sourceKind !== "github" || !row.repo) return null;
	return { repo: row.repo, ref: row.ref ?? "HEAD" };
}
