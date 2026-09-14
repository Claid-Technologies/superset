// biome-ignore-all lint/suspicious/noTemplateCurlyInString: ${inputs.*} and ${config.*} are the manifest placeholder syntax this schema documents
import { z } from "zod";
import { PLUGIN_CATEGORIES } from "./index";

const NAME_PATTERN = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

export const pluginConnectorRefSchema = z
	.object({
		slug: z
			.string()
			.describe(
				"A connector in the Superset registry. The connections system owns how the connection is obtained; a manifest only names which one it needs.",
			),
		required: z
			.boolean()
			.optional()
			.describe(
				"Whether the plugin is unusable without this connection. The first required connector is the one a dispatch runs under.",
			),
	})
	.meta({ id: "PluginConnectorRef" });

const pluginBindSchema = z
	.object({
		headers: z.record(z.string(), z.string()).optional(),
		env: z.record(z.string(), z.string()).optional(),
	})
	.describe(
		"How the connection's credential reaches the server. ${config.access_token} is substituted by the credential proxy at call time.",
	);

const pluginMcpSchema = z
	.object({
		type: z.literal("streamable-http"),
		url: z.url(),
		headers: z.record(z.string(), z.string()).optional(),
	})
	.describe(
		"A single remote server, not a map: a plugin serves tools from exactly one place. Omit it when the plugin ships a bundled server instead. Streamable HTTP only — the legacy HTTP+SSE transport is not supported.",
	);

const pluginServerSchema = z
	.object({
		path: z.string().optional(),
		integrity: z.string().optional(),
		ref: z.string().optional(),
	})
	.describe(
		"Where a host downloads a bundled server from, and what it must hash to. Written by `superset plugins publish`.",
	);

export const supersetExtensionSchema = z
	.object({
		interface: z
			.object({
				displayName: z.string(),
				category: z.enum(PLUGIN_CATEGORIES).optional(),
				icon: z.string().optional(),
			})
			.optional(),
		connectors: z
			.array(pluginConnectorRefSchema)
			.optional()
			.describe(
				"Connections this plugin needs, by connector slug. A manifest carries no OAuth configuration of its own — no scopes, no client mode, no requires_env.",
			),
		bind: pluginBindSchema.optional(),
		mcp: pluginMcpSchema.optional(),
		server: pluginServerSchema.optional(),
	})
	.meta({ id: "SupersetExtension" });

export const pluginManifestSchema = z
	.object({
		$schema: z.string().optional(),
		name: z
			.string()
			.regex(
				NAME_PATTERN,
				"lowercase letters, digits, dots and dashes; no leading, trailing or doubled separators",
			),
		version: z.string(),
		description: z.string().optional(),
		author: z
			.object({ name: z.string().optional(), url: z.url().optional() })
			.optional(),
		homepage: z.url().optional(),
		repository: z.string().optional(),
		license: z.string().optional(),
		keywords: z.array(z.string()).optional(),
		extensions: z.object({ superset: supersetExtensionSchema }).optional(),
	})
	.meta({
		id: "PluginManifest",
		title: "Superset plugin manifest",
		description:
			"plugin.json for a Superset marketplace plugin. Authoring guide: https://docs.superset.sh",
	});

export type PluginManifestInput = z.input<typeof pluginManifestSchema>;
