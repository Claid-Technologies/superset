import { db } from "@superset/db/client";
import { connections, type SelectConnection } from "@superset/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import {
	decryptOptional,
	decryptSecret,
	encryptOptional,
	encryptSecret,
} from "../../router/plugins/crypto";
import { credentialFetch } from "../../router/plugins/manifest";
import { connectorMethod, requireConnector, resolveEndpoints } from "./index";

const DEFAULT_EXPIRY_BUFFER_SECONDS = 60;

export class UnrefreshableConnectionError extends Error {
	constructor(connector: string) {
		super(
			`The ${connector} connection expired and carries no refresh token; reconnect it.`,
		);
		this.name = "UnrefreshableConnectionError";
	}
}

function expiringSoon(expiresAt: Date | null, bufferSeconds: number): boolean {
	if (!expiresAt) return false;
	return expiresAt.getTime() - Date.now() <= bufferSeconds * 1000;
}

export async function ensureFreshConnection(
	row: SelectConnection,
): Promise<SelectConnection> {
	const connector = requireConnector(row.connector);
	const method = connectorMethod(
		connector,
		row.authMethod as never as undefined,
	);
	if (method.type !== "oauth2") return row;

	const buffer =
		method.token_expiration_buffer ?? DEFAULT_EXPIRY_BUFFER_SECONDS;
	if (!expiringSoon(row.tokenExpiresAt, buffer)) return row;

	const refreshToken = await decryptOptional(row.refreshToken);
	if (!refreshToken) throw new UnrefreshableConnectionError(row.connector);

	const endpoints = await resolveEndpoints(row.connector, method, "");
	const { clientId, clientSecret } = endpoints;

	const body = new URLSearchParams({
		grant_type: "refresh_token",
		refresh_token: refreshToken,
	});
	const headers: Record<string, string> = {
		"Content-Type": "application/x-www-form-urlencoded",
		Accept: "application/json",
	};
	if (endpoints.authentication === "basic")
		headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
	else {
		body.set("client_id", clientId);
		if (clientSecret) body.set("client_secret", clientSecret);
	}

	const response = await credentialFetch(
		endpoints.tokenEndpoint,
		{ method: "POST", headers, body },
		`Connector "${row.connector}" refresh`,
	);
	const payload = (await response.json()) as Record<string, unknown>;
	if (!response.ok || typeof payload.access_token !== "string")
		throw new UnrefreshableConnectionError(row.connector);

	const expiresIn = payload.expires_in;
	const [updated] = await db
		.update(connections)
		.set({
			accessToken: await encryptSecret(payload.access_token),
			refreshToken:
				typeof payload.refresh_token === "string"
					? await encryptSecret(payload.refresh_token)
					: await encryptOptional(refreshToken),
			tokenExpiresAt:
				typeof expiresIn === "number"
					? new Date(Date.now() + expiresIn * 1000)
					: null,
		})
		.where(and(eq(connections.id, row.id), isNull(connections.disconnectedAt)))
		.returning();

	return updated ?? row;
}

export async function connectionAccessToken(
	row: SelectConnection,
): Promise<string> {
	const fresh = await ensureFreshConnection(row);
	return await decryptSecret(fresh.accessToken);
}
