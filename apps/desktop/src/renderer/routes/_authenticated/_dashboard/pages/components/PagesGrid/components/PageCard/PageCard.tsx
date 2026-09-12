import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { getInitials } from "@superset/shared/names";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { commentAuthor, DeletePageDialog } from "@superset/ui/page-comments";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import {
	Bot,
	Globe,
	Link2,
	Lock,
	MessageCircle,
	MoreVertical,
	Pin,
	PinOff,
	Trash2,
} from "lucide-react";
import { type MouseEvent, useState } from "react";
import { PageThumbnail } from "./components/PageThumbnail";

export interface PageCardLastComment {
	body: string;
	authorKind: "human" | "agent";
	authorName: string;
	authorImage: string | null;
	createdAt: Date | string;
}

export interface PageCardItem {
	id: string;
	slug: string;
	title: string;
	url: string;
	thumbnailUrl: string | null;
	visibility: string;
	createdAt: Date | string;
	updatedAt: Date | string;
	latestVersion: number | null;
	sharedVersion: number | null;
	createdByUserId: string | null;
	ownerName: string | null;
	commentCount: number;
	openThreadCount: number;
	lastComment: PageCardLastComment | null;
}

interface PageCardProps {
	page: PageCardItem;
	isPinned: boolean;
	currentUserId: string | undefined;
	onOpen: (page: PageCardItem, event: MouseEvent) => void;
	onTogglePin: (pageId: string) => void;
	onDelete: (pageId: string) => Promise<void>;
}

export function PageCard({
	page,
	isPinned,
	currentUserId,
	onOpen,
	onTogglePin,
	onDelete,
}: PageCardProps) {
	const { formatRelativeTime, formatCompactRelativeTime } = useFormat();

	const { t } = useLingui();
	const [deleteOpen, setDeleteOpen] = useState(false);
	const isShared = page.visibility === "org";
	const isOwner =
		currentUserId !== undefined && currentUserId === page.createdByUserId;
	const ownerName = isOwner ? null : page.ownerName;
	const VisibilityIcon = isShared ? Globe : Lock;
	const edited = new Date(page.updatedAt).getTime();
	const created = new Date(page.createdAt).getTime();
	const wasEdited = edited - created > 60_000;
	const timestamp = formatRelativeTime(wasEdited ? edited : created);
	const lastAuthor = page.lastComment ? commentAuthor(page.lastComment) : null;

	const copyLink = async () => {
		try {
			await navigator.clipboard.writeText(page.url);
			toast.success(
				t({
					message: "Link copied",
				}),
			);
		} catch {
			toast.error(
				t({
					message: "Could not copy the link",
				}),
			);
		}
	};

	return (
		<div className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-muted-foreground/30">
			<button
				type="button"
				onClick={(event) => onOpen(page, event)}
				className="flex flex-1 flex-col text-left"
			>
				<div className="relative">
					<PageThumbnail src={page.thumbnailUrl} />
					{page.lastComment && lastAuthor ? (
						<div className="absolute inset-x-0 bottom-0 flex items-center gap-2 border-border/60 border-t bg-background/85 px-3 py-2 text-xs opacity-0 backdrop-blur transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
							<Avatar className="size-4 shrink-0">
								<AvatarImage src={lastAuthor.image ?? undefined} alt="" />
								<AvatarFallback className="text-[8px]">
									{lastAuthor.isAgent ? (
										<Bot className="size-2.5" />
									) : (
										getInitials(lastAuthor.name) || "?"
									)}
								</AvatarFallback>
							</Avatar>
							<span className="min-w-0 flex-1 truncate">
								<span className="font-medium">{lastAuthor.name}</span>{" "}
								<span className="text-muted-foreground">
									{page.lastComment.body}
								</span>
							</span>
							<span className="shrink-0 text-[11px] text-muted-foreground">
								{formatCompactRelativeTime(
									new Date(page.lastComment.createdAt),
								)}
							</span>
						</div>
					) : null}
				</div>
				<div className="flex flex-col gap-1 border-border/60 border-t px-3 py-2.5">
					<span className="truncate font-medium text-sm">{page.title}</span>
					<span className="flex items-center gap-1.5 text-muted-foreground text-xs">
						<VisibilityIcon className="size-3 shrink-0" />
						<span aria-hidden="true">·</span>
						<span className="truncate">
							{wasEdited ? <Trans>Edited</Trans> : <Trans>Created</Trans>}{" "}
							{timestamp}
						</span>
						{ownerName ? (
							<>
								<span aria-hidden="true">·</span>
								<span className="truncate">{ownerName}</span>
							</>
						) : null}
						{page.commentCount > 0 ? (
							<span
								className={cn(
									"ml-auto flex shrink-0 items-center gap-1 tabular-nums",
									page.openThreadCount > 0 && "text-amber-500",
								)}
							>
								<MessageCircle className="size-3" aria-hidden="true" />
								<span aria-hidden="true">{page.commentCount}</span>
								<span className="sr-only">
									<Plural
										value={page.commentCount}
										one="# reply"
										other="# replies"
									/>
									{page.openThreadCount > 0 ? (
										<>
											{", "}
											<Plural
												value={page.openThreadCount}
												one="# open thread"
												other="# open threads"
											/>
										</>
									) : null}
								</span>
							</span>
						) : null}
					</span>
				</div>
			</button>

			{isPinned && (
				<Pin className="absolute top-2 left-2 size-3.5 fill-current text-muted-foreground" />
			)}

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label={t({
							message: `Actions for ${page.title}`,
						})}
						className={cn(
							"absolute top-2 right-2 size-7 bg-background/80 backdrop-blur transition-opacity",
							"opacity-0 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100",
						)}
					>
						<MoreVertical className="size-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onSelect={() => onTogglePin(page.id)}>
						{isPinned ? (
							<PinOff className="size-4" />
						) : (
							<Pin className="size-4" />
						)}
						{isPinned ? <Trans>Unpin</Trans> : <Trans>Pin</Trans>}
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => void copyLink()}>
						<Link2 className="size-4" />
						<Trans>Copy link</Trans>
					</DropdownMenuItem>
					{isOwner ? (
						<DropdownMenuItem
							variant="destructive"
							onSelect={() => setDeleteOpen(true)}
						>
							<Trash2 className="size-4" />
							<Trans>Delete</Trans>
						</DropdownMenuItem>
					) : null}
				</DropdownMenuContent>
			</DropdownMenu>

			<DeletePageDialog
				open={deleteOpen}
				onOpenChange={setDeleteOpen}
				title={page.title}
				versionCount={page.latestVersion ?? 1}
				onConfirm={() => onDelete(page.id)}
			/>
		</div>
	);
}
