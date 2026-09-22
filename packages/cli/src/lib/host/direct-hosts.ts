import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { SUPERSET_HOME_DIR } from "../config";

/**
 * A host reached without the relay: the desktop or CLI talks to it at a
 * loopback URL that an SSH/IAP tunnel forwards to the host's own loopback,
 * authenticating with the host's pre-shared secret instead of a user JWT.
 * Keyed by the host's machineId (what `--host` and the roster use).
 */
export interface DirectHostConfig {
	/** e.g. `http://127.0.0.1:4879` — the local end of the tunnel. */
	url: string;
	/** The host's pre-shared secret (`superset start --secret-file`). */
	token: string;
}

export type DirectHostsFile = Record<string, DirectHostConfig>;

export const DIRECT_HOSTS_PATH = join(SUPERSET_HOME_DIR, "direct-hosts.json");

const LOOPBACK_URL = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/;

export function normalizeDirectUrl(url: string): string {
	const trimmed = url.trim().replace(/\/+$/, "");
	if (!LOOPBACK_URL.test(trimmed)) {
		throw new Error(
			`Direct host URL must be a loopback address like http://127.0.0.1:4879 (got ${trimmed})`,
		);
	}
	// Only 127.0.0.1 is in the desktop's CSP; fold the aliases onto it.
	return trimmed.replace(/^http:\/\/(localhost|\[::1\])/, "http://127.0.0.1");
}

export function readDirectHosts(path = DIRECT_HOSTS_PATH): DirectHostsFile {
	if (!existsSync(path)) return {};
	try {
		const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
		if (!parsed || typeof parsed !== "object") return {};
		const out: DirectHostsFile = {};
		for (const [machineId, value] of Object.entries(
			parsed as Record<string, unknown>,
		)) {
			if (!value || typeof value !== "object") continue;
			const { url, token } = value as Partial<DirectHostConfig>;
			if (typeof url !== "string" || typeof token !== "string") continue;
			try {
				out[machineId] = { url: normalizeDirectUrl(url), token };
			} catch {
				// skip malformed entries rather than failing every command
			}
		}
		return out;
	} catch {
		return {};
	}
}

export function writeDirectHosts(
	hosts: DirectHostsFile,
	path = DIRECT_HOSTS_PATH,
): void {
	const dir = dirname(path);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
	writeFileSync(path, `${JSON.stringify(hosts, null, 2)}\n`, { mode: 0o600 });
	chmodSync(path, 0o600);
}

export function getDirectHost(machineId: string): DirectHostConfig | null {
	return readDirectHosts()[machineId] ?? null;
}
