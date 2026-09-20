import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { showHostServiceUnavailableToast } from "renderer/lib/host-service-unavailable";
import { useFinalizeProjectSetup } from "renderer/react-query/projects";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { MultiRepoProjectForm } from "./components/MultiRepoProjectForm";
import {
	appendFolder,
	removeFolder,
	type SelectedFolder,
} from "./MultiRepoProjectModal.utils";

interface MultiRepoProjectModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess: (result: { projectId: string }) => void;
}

export function MultiRepoProjectModal({
	open,
	onOpenChange,
	onSuccess,
}: MultiRepoProjectModalProps) {
	const { t } = useLingui();
	const hostService = useLocalHostService();
	const finalizeSetup = useFinalizeProjectSetup();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();

	const [name, setName] = useState("");
	const [folders, setFolders] = useState<SelectedFolder[]>([]);
	const [working, setWorking] = useState(false);
	const [failure, setFailure] = useState<string | null>(null);
	const [projectId, setProjectId] = useState<string | null>(null);
	const [committedPaths, setCommittedPaths] = useState<string[]>([]);

	const reset = () => {
		setName("");
		setFolders([]);
		setWorking(false);
		setFailure(null);
		setProjectId(null);
		setCommittedPaths([]);
	};

	const handleOpenChange = (next: boolean) => {
		if (!next && working) return;
		if (!next) reset();
		onOpenChange(next);
	};

	const handleAddFolder = async () => {
		try {
			const picked = await selectDirectory.mutateAsync({
				title: t({ message: "Select a source folder" }),
			});
			if (picked.canceled || !picked.path) return;
			const path = picked.path;
			if (folders.some((folder) => folder.path === path)) {
				toast.error(t({ message: "That folder is already in the list" }));
				return;
			}
			setFolders(appendFolder(folders, path));
		} catch (error) {
			toast.error(errorMessage(error));
		}
	};

	const createProject = async () => {
		const primary = folders[0];
		if (!primary) return;

		setWorking(true);
		setFailure(null);
		try {
			const hostUrl = await hostService.waitForHostReady();
			if (!hostUrl) {
				showHostServiceUnavailableToast(hostService, {
					action: "createProject",
				});
				return;
			}
			const client = getHostServiceClientByUrl(hostUrl);

			const attached = new Set(committedPaths);
			let createdProjectId = projectId;
			if (!createdProjectId) {
				try {
					const result = await client.project.create.mutate({
						name: name.trim() || primary.name,
						mode: { kind: "importLocal", repoPath: primary.path },
					});
					finalizeSetup(hostUrl, result);
					createdProjectId = result.projectId;
					setProjectId(createdProjectId);
				} catch (error) {
					setFailure(
						t({
							message: `Could not create the project from "${primary.name}": ${errorMessage(error)}`,
						}),
					);
					return;
				}
				attached.add(primary.path);
				setCommittedPaths([...attached]);
			}

			for (const folder of folders.slice(1)) {
				if (attached.has(folder.path)) continue;
				try {
					await client.project.folders.add.mutate({
						projectId: createdProjectId,
						repoPath: folder.path,
						folder: folder.name,
					});
				} catch (error) {
					setCommittedPaths([...attached]);
					setFailure(
						t({
							message: `The project was created, but "${folder.name}" could not be added: ${errorMessage(error)}. The folders added before it were kept — remove it or fix it and create again.`,
						}),
					);
					return;
				}
				attached.add(folder.path);
			}

			setCommittedPaths([...attached]);
			onSuccess({ projectId: createdProjectId });
			reset();
			onOpenChange(false);
		} catch (error) {
			setFailure(errorMessage(error));
		} finally {
			setWorking(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange} modal>
			<DialogContent className="max-w-[520px]">
				<DialogHeader>
					<DialogTitle>
						<Trans>Create project</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>
							Group several repositories into one project. Every workspace
							checks out all of them.
						</Trans>
					</DialogDescription>
				</DialogHeader>

				<MultiRepoProjectForm
					name={name}
					folders={folders}
					committedPaths={committedPaths}
					failure={failure}
					isWorking={working}
					isPicking={selectDirectory.isPending}
					onNameChange={setName}
					onAddFolder={() => void handleAddFolder()}
					onRemoveFolder={(path) => setFolders(removeFolder(folders, path))}
					onCancel={() => handleOpenChange(false)}
					onCreate={() => void createProject()}
				/>
			</DialogContent>
		</Dialog>
	);
}
