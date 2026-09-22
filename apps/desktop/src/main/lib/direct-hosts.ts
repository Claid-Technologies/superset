import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { SUPERSET_HOME_DIR } from "./app-environment";

/**
 * Hosts reached without the relay. The desktop talks to such a host at a
 * loopback URL — the local end of an SSH/IAP tunnel that terminates on the
 * host's own loopback — and authenticates with the host's pre-shared secret
 * instead of the user's JWT, exactly as it does with the local host-service.
 *
 * Keyed by the host's machineId (the roster's `machineId`). Shared with the
 * CLI, which reads the same file for `--host <machineId>`.
 */
export interface DirectHostConfig {
	/** e.g. `http://127.0.0.1:4879` — must be loopback (CSP only allows 127.0.0.1). */
	url: string;
	/** The host's pre-shared secret (`superset start --direct --secret-file …`). */
	token: string;
}

export type DirectHostsMap = Record<string, DirectHostConfig>;

export const DIRECT_HOSTS_PATH = join(SUPERSET_HOME_DIR, "direct-hosts.json");

const LOOPBACK_URL = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/;

export function normalizeDirectHostUrl(url: string): string {
	const trimmed = url.trim().replace(/\/+$/, "");
	if (!LOOPBACK_URL.test(trimmed)) {
		throw new Error(
			`Direct host URL must be a loopback address like http://127.0.0.1:4879 (got ${trimmed})`,
		);
	}
	return trimmed.replace(/^http:\/\/(localhost|\[::1\])/, "http://127.0.0.1");
}

let cache: { mtimeMs: number; hosts: DirectHostsMap } | null = null;

export function readDirectHosts(): DirectHostsMap {
	if (!existsSync(DIRECT_HOSTS_PATH)) {
		cache = null;
		return {};
	}
	try {
		const raw = readFileSync(DIRECT_HOSTS_PATH, "utf-8");
		const parsed = JSON.parse(raw) as unknown;
		const hosts: DirectHostsMap = {};
		if (parsed && typeof parsed === "object") {
			for (const [machineId, value] of Object.entries(
				parsed as Record<string, unknown>,
			)) {
				if (!value || typeof value !== "object") continue;
				const { url, token } = value as Partial<DirectHostConfig>;
				if (typeof url !== "string" || typeof token !== "string") continue;
				try {
					hosts[machineId] = { url: normalizeDirectHostUrl(url), token };
				} catch {
					// skip a malformed entry; the rest stay usable
				}
			}
		}
		cache = { mtimeMs: Date.now(), hosts };
		return hosts;
	} catch {
		return {};
	}
}

export function writeDirectHosts(hosts: DirectHostsMap): void {
	const dir = dirname(DIRECT_HOSTS_PATH);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
	writeFileSync(DIRECT_HOSTS_PATH, `${JSON.stringify(hosts, null, 2)}\n`, {
		mode: 0o600,
	});
	chmodSync(DIRECT_HOSTS_PATH, 0o600);
	cache = { mtimeMs: Date.now(), hosts };
}

export function setDirectHost(
	machineId: string,
	config: DirectHostConfig,
): DirectHostsMap {
	const hosts = readDirectHosts();
	hosts[machineId] = {
		url: normalizeDirectHostUrl(config.url),
		token: config.token.trim(),
	};
	writeDirectHosts(hosts);
	return hosts;
}

export function removeDirectHost(machineId: string): DirectHostsMap {
	const hosts = readDirectHosts();
	delete hosts[machineId];
	writeDirectHosts(hosts);
	return hosts;
}

/**
 * The bearer for a host URL, if it is a configured direct host. Used by the
 * main-process port forwarder, which otherwise sends the relay JWT.
 */
export function getDirectHostToken(hostUrl: string): string | null {
	const hosts = cache?.hosts ?? readDirectHosts();
	const wanted = hostUrl.replace(/\/+$/, "");
	for (const host of Object.values(hosts)) {
		if (host.url === wanted) return host.token;
	}
	return null;
}
