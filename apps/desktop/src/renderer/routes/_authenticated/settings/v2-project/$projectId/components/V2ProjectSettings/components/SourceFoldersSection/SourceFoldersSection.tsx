import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuPlus } from "react-icons/lu";
import { RemotePathPicker } from "renderer/components/RemotePathPicker";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { SettingsSection } from "../../../../../../components/SettingsSection";
import { RemoveFolderDialog } from "./components/RemoveFolderDialog";
import { RenameFolderDialog } from "./components/RenameFolderDialog";
import { SourceFolderRow } from "./components/SourceFolderRow";
import { withoutFolder, withPrimaryFolder } from "./SourceFoldersSection.utils";
import type { ProjectFolder } from "./types";

interface SourceFoldersSectionProps {
	projectId: string;
	hostUrl: string | null;
	hostName: string;
	isRemoteTarget: boolean;
	/** The host has a row for this project; `project.folders.*` 404s otherwise. */
	isProjectSetup: boolean;
}

export function SourceFoldersSection({
	projectId,
	hostUrl,
	hostName,
	isRemoteTarget,
	isProjectSetup,
}: SourceFoldersSectionProps) {
	const { t } = useLingui();
	const queryClient = useQueryClient();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();
	const [renameTarget, setRenameTarget] = useState<ProjectFolder | null>(null);
	const [removeTarget, setRemoveTarget] = useState<ProjectFolder | null>(null);
	const [browseOpen, setBrowseOpen] = useState(false);

	const queryKey = ["project-folders", "list", hostUrl, projectId];
	const foldersQuery = useQuery({
		queryKey,
		enabled: Boolean(hostUrl) && isProjectSetup,
		queryFn: async () => {
			if (!hostUrl) return { folders: [] as ProjectFolder[] };
			return getHostServiceClientByUrl(hostUrl).project.folders.list.query({
				projectId,
			});
		},
	});
	const folders = foldersQuery.data?.folders ?? [];

	const runOptimistically = async (
		next: ProjectFolder[],
		request: () => Promise<unknown>,
	) => {
		await queryClient.cancelQueries({ queryKey });
		const previous = queryClient.getQueryData(queryKey);
		queryClient.setQueryData(queryKey, { folders: next });
		try {
			await request();
		} catch (error) {
			queryClient.setQueryData(queryKey, previous);
			throw error;
		} finally {
			void queryClient.invalidateQueries({ queryKey });
		}
	};

	const client = () => {
		if (!hostUrl) throw new Error("Host unavailable");
		return getHostServiceClientByUrl(hostUrl);
	};

	const setPrimary = useMutation({
		mutationFn: (folder: ProjectFolder) =>
			runOptimistically(withPrimaryFolder(folders, folder.id), () =>
				client().project.folders.setPrimary.mutate({
					projectId,
					folderId: folder.id,
				}),
			),
		onError: (error) => toast.error(errorMessage(error)),
	});

	const remove = useMutation({
		mutationFn: (folder: ProjectFolder) =>
			runOptimistically(withoutFolder(folders, folder.id), () =>
				client().project.folders.remove.mutate({
					projectId,
					folderId: folder.id,
				}),
			),
		onSuccess: () => setRemoveTarget(null),
		onError: (error) => toast.error(errorMessage(error)),
	});

	const rename = useMutation({
		mutationFn: ({ folder, name }: { folder: ProjectFolder; name: string }) =>
			runOptimistically(
				folders.map((candidate) =>
					candidate.id === folder.id
						? { ...candidate, folder: name }
						: candidate,
				),
				() =>
					client().project.folders.rename.mutate({
						projectId,
						folderId: folder.id,
						folder: name,
					}),
			),
		onSuccess: () => setRenameTarget(null),
		onError: (error) => toast.error(errorMessage(error)),
	});

	const add = useMutation({
		mutationFn: (repoPath: string) =>
			client().project.folders.add.mutate({ projectId, repoPath }),
		onSuccess: (result) => {
			toast.success(
				t({ message: `Added ${result.folder.folder} to this project` }),
			);
			void queryClient.invalidateQueries({ queryKey });
		},
		onError: (error) => toast.error(errorMessage(error)),
	});

	const isBusy =
		setPrimary.isPending ||
		remove.isPending ||
		rename.isPending ||
		add.isPending;

	const handleAdd = async () => {
		if (isRemoteTarget) {
			setBrowseOpen(true);
			return;
		}
		try {
			const picked = await selectDirectory.mutateAsync({
				title: t({ message: "Select a repository to add" }),
			});
			if (picked.canceled || !picked.path) return;
			add.mutate(picked.path);
		} catch (error) {
			toast.error(errorMessage(error));
		}
	};

	return (
		<SettingsSection
			title={t({ message: "Source folders" })}
			description={t({
				message:
					"Repositories checked out into every workspace for this project. The primary is the one single-repository tools use.",
			})}
		>
			<div className="divide-y rounded-md border">
				{folders.map((folder) => (
					<SourceFolderRow
						key={folder.id}
						folder={folder}
						isPrimary={folder.position === 0}
						disabled={isBusy}
						onMakePrimary={() => setPrimary.mutate(folder)}
						onRename={() => setRenameTarget(folder)}
						onRemove={() => setRemoveTarget(folder)}
					/>
				))}
				{folders.length === 0 && (
					<p className="px-3 py-3 text-sm text-muted-foreground">
						{foldersQuery.isLoading ? (
							<Trans>Loading folders…</Trans>
						) : (
							<Trans>This project has no folders on {hostName} yet.</Trans>
						)}
					</p>
				)}
				<div className="px-3 py-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="gap-2"
						onClick={handleAdd}
						disabled={!hostUrl || !isProjectSetup || isBusy}
					>
						<LuPlus className="size-4" />
						<Trans>Add folder</Trans>
					</Button>
				</div>
			</div>

			<RenameFolderDialog
				folder={renameTarget}
				takenNames={folders.map((folder) => folder.folder)}
				isSubmitting={rename.isPending}
				onOpenChange={(open) => {
					if (!open) setRenameTarget(null);
				}}
				onSubmit={(name) => {
					if (renameTarget) rename.mutate({ folder: renameTarget, name });
				}}
			/>

			<RemoveFolderDialog
				folder={removeTarget}
				isSubmitting={remove.isPending}
				onOpenChange={(open) => {
					if (!open) setRemoveTarget(null);
				}}
				onConfirm={() => {
					if (removeTarget) remove.mutate(removeTarget);
				}}
			/>

			<RemotePathPicker
				open={browseOpen}
				onOpenChange={setBrowseOpen}
				hostUrl={hostUrl}
				hostName={hostName}
				title={t({ message: "Add a repository folder" })}
				description={t({
					message: `Pick a repository on ${hostName} to add to this project.`,
				})}
				confirmLabel={t({ message: "Use this folder" })}
				onPick={(path) => add.mutate(path)}
			/>
		</SettingsSection>
	);
}
