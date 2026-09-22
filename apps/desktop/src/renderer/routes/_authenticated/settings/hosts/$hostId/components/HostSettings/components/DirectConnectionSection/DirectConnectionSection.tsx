import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { useEffect, useState } from "react";
import { useDirectHosts } from "renderer/lib/direct-hosts";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

const DEFAULT_URL = "http://127.0.0.1:4879";

interface DirectConnectionSectionProps {
	machineId: string;
}

/**
 * Reach a remote host over the user's own tunnel instead of the relay: the
 * local end of an SSH/IAP tunnel and the host's pre-shared secret. Saved to
 * `direct-hosts.json` in the Superset home dir, which the CLI reads too.
 */
export function DirectConnectionSection({
	machineId,
}: DirectConnectionSectionProps) {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const utils = electronTrpc.useUtils();
	const directHosts = useDirectHosts();
	const configured = directHosts[machineId] ?? null;

	const [url, setUrl] = useState(configured?.url ?? DEFAULT_URL);
	const [token, setToken] = useState("");
	useEffect(() => {
		if (configured) setUrl(configured.url);
	}, [configured]);

	const save = electronTrpc.directHosts.set.useMutation({
		onSuccess: () => {
			setToken("");
			void utils.directHosts.list.invalidate();
			toast.success(t({ message: "Direct connection saved" }));
		},
		onError: (error) => toast.error(error.message),
	});
	const remove = electronTrpc.directHosts.remove.useMutation({
		onSuccess: () => {
			setUrl(DEFAULT_URL);
			setToken("");
			void utils.directHosts.list.invalidate();
			toast.success(t({ message: "Direct connection removed" }));
		},
		onError: (error) => toast.error(error.message),
	});

	const effectiveToken = token.trim() || configured?.token || "";
	const canSave = url.trim().length > 0 && effectiveToken.length >= 16;

	return (
		<section className="space-y-3">
			<div>
				<h3 className="text-sm font-medium">
					<HighlightText
						text={t({ message: "Direct connection" })}
						query={searchQuery}
					/>
				</h3>
				<p className="text-xs text-muted-foreground mt-0.5">
					<Trans>
						Reach this host through your own tunnel instead of the relay. Point
						it at the local end of an SSH tunnel to the host's loopback (for
						example <code>ssh -L 4879:127.0.0.1:4879</code>) and paste the
						secret from the host's <code>--secret-file</code>. Nothing for this
						host then leaves your machine except through that tunnel.
					</Trans>
				</p>
			</div>
			<div className="grid gap-3 max-w-lg">
				<div className="space-y-1">
					<Label htmlFor="direct-host-url" className="text-xs">
						<Trans>Local tunnel URL</Trans>
					</Label>
					<Input
						id="direct-host-url"
						value={url}
						placeholder={DEFAULT_URL}
						onChange={(event) => setUrl(event.target.value)}
						spellCheck={false}
					/>
				</div>
				<div className="space-y-1">
					<Label htmlFor="direct-host-token" className="text-xs">
						<Trans>Host secret</Trans>
					</Label>
					<Input
						id="direct-host-token"
						type="password"
						value={token}
						placeholder={
							configured
								? t({ message: "Saved — enter a new value to replace it" })
								: t({ message: "Contents of the host's secret file" })
						}
						onChange={(event) => setToken(event.target.value)}
						autoComplete="off"
						spellCheck={false}
					/>
				</div>
				<div className="flex items-center gap-2">
					<Button
						size="sm"
						disabled={!canSave || save.isPending}
						onClick={() =>
							save.mutate({ machineId, url: url.trim(), token: effectiveToken })
						}
					>
						{configured ? (
							<Trans>Update</Trans>
						) : (
							<Trans>Connect directly</Trans>
						)}
					</Button>
					{configured && (
						<Button
							variant="outline"
							size="sm"
							disabled={remove.isPending}
							onClick={() => remove.mutate({ machineId })}
						>
							<Trans>Use relay instead</Trans>
						</Button>
					)}
					{configured && (
						<span className="text-xs text-muted-foreground">
							<Trans>Direct: {configured.url}</Trans>
						</span>
					)}
				</div>
			</div>
		</section>
	);
}
