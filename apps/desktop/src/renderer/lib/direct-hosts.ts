import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { create } from "zustand";
import {
	removeHostServiceSecret,
	setHostServiceSecret,
} from "./host-service-auth";

/**
 * Hosts reached over the user's own tunnel instead of the relay.
 *
 * A direct host is addressed at a loopback URL (the local end of an SSH/IAP
 * tunnel) and takes its pre-shared secret as bearer, exactly like the local
 * host-service. Registering the secret against the URL is what makes every
 * tRPC call, event-bus socket and terminal socket to that URL send it.
 */
export interface DirectHostConfig {
	url: string;
	token: string;
}

export type DirectHostsMap = Record<string, DirectHostConfig>;

interface DirectHostsState {
	hosts: DirectHostsMap;
	/** False until the main process has answered once. */
	loaded: boolean;
	setHosts: (hosts: DirectHostsMap) => void;
}

const EMPTY: DirectHostsMap = {};

export const useDirectHostsStore = create<DirectHostsState>((set, get) => ({
	hosts: EMPTY,
	loaded: false,
	setHosts: (next) => {
		const previous = get().hosts;
		for (const [machineId, host] of Object.entries(previous)) {
			if (next[machineId]?.url !== host.url) removeHostServiceSecret(host.url);
		}
		for (const host of Object.values(next)) {
			setHostServiceSecret(host.url, host.token);
		}
		set({ hosts: next, loaded: true });
	},
}));

/** Non-hook read for stores and pure resolvers. */
export function getDirectHostUrl(machineId: string): string | null {
	return useDirectHostsStore.getState().hosts[machineId]?.url ?? null;
}

export function useDirectHosts(): DirectHostsMap {
	return useDirectHostsStore((state) => state.hosts);
}

export function useDirectHostUrl(machineId: string | null): string | null {
	return useDirectHostsStore((state) =>
		machineId ? (state.hosts[machineId]?.url ?? null) : null,
	);
}

/**
 * Where a non-local host is reached: its direct URL when one is configured,
 * else the relay. Every place that used to build the relay URL inline goes
 * through here so a direct host is honoured consistently.
 */
export function resolveRemoteHostUrl(args: {
	organizationId: string;
	hostId: string;
	relayUrl: string;
	directHosts?: DirectHostsMap;
}): string {
	const direct = (args.directHosts ?? useDirectHostsStore.getState().hosts)[
		args.hostId
	]?.url;
	if (direct) return direct;
	return `${args.relayUrl}/hosts/${buildHostRoutingKey(args.organizationId, args.hostId)}`;
}
