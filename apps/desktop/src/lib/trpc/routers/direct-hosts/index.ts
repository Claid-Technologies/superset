import {
	readDirectHosts,
	removeDirectHost,
	setDirectHost,
} from "main/lib/direct-hosts";
import { z } from "zod";
import { publicProcedure, router } from "../..";

/**
 * Hosts the desktop reaches over the user's own tunnel instead of the relay.
 * Stored in `~/.superset/direct-hosts.json` (0600), shared with the CLI.
 */
export const createDirectHostsRouter = () => {
	return router({
		list: publicProcedure.query(() => readDirectHosts()),

		set: publicProcedure
			.input(
				z.object({
					machineId: z.string().min(1),
					url: z.string().min(1),
					token: z.string().min(16),
				}),
			)
			.mutation(({ input }) => {
				return setDirectHost(input.machineId, {
					url: input.url,
					token: input.token,
				});
			}),

		remove: publicProcedure
			.input(z.object({ machineId: z.string().min(1) }))
			.mutation(({ input }) => removeDirectHost(input.machineId)),
	});
};
