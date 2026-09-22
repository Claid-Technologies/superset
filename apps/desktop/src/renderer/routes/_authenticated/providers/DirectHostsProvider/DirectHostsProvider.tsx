import { type ReactNode, useEffect } from "react";
import { useDirectHostsStore } from "renderer/lib/direct-hosts";
import { electronTrpc } from "renderer/lib/electron-trpc";

const REFRESH_MS = 15_000;

/**
 * Mirrors the main process's direct-hosts file into the renderer, and
 * registers each host's secret against its URL so the host-service clients
 * authenticate with it. Polled: the file is also edited by the CLI.
 */
export function DirectHostsProvider({ children }: { children: ReactNode }) {
	const { data } = electronTrpc.directHosts.list.useQuery(undefined, {
		refetchInterval: REFRESH_MS,
		refetchOnWindowFocus: true,
	});
	const setHosts = useDirectHostsStore((state) => state.setHosts);
	useEffect(() => {
		if (data) setHosts(data);
	}, [data, setHosts]);
	return <>{children}</>;
}
