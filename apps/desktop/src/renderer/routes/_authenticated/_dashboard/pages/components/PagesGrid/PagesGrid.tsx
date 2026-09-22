import { Trans } from "@lingui/react/macro";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@superset/ui/empty";
import { Skeleton } from "@superset/ui/skeleton";
import { LuSearchX } from "react-icons/lu";
import { PageCard, type PageCardItem } from "./components/PageCard";
import { PagesEmptyState } from "./components/PagesEmptyState";
import { THUMBNAIL_ASPECT_RATIO } from "./constants";

const SKELETON_KEYS = [
	"skeleton-a",
	"skeleton-b",
	"skeleton-c",
	"skeleton-d",
	"skeleton-e",
	"skeleton-f",
] as const;

interface PagesGridProps {
	onCreate: (request?: string) => void;
	isCreating: boolean;
	pages: PageCardItem[];
	pinnedPageIds: ReadonlySet<string>;
	currentUserId: string | undefined;
	isPending: boolean;
	error?: string;
	hasFilters: boolean;
	onOpen: (page: PageCardItem, event: React.MouseEvent) => void;
	onTogglePin: (pageId: string) => void;
	onDelete: (pageId: string) => Promise<void>;
}

export function PagesGrid({
	onCreate,
	isCreating,
	pages,
	pinnedPageIds,
	currentUserId,
	isPending,
	error,
	hasFilters,
	onOpen,
	onTogglePin,
	onDelete,
}: PagesGridProps) {
	if (isPending) {
		return (
			<div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{SKELETON_KEYS.map((key) => (
					<div
						key={key}
						className="flex flex-col overflow-hidden rounded-lg border border-border"
					>
						<Skeleton
							className="w-full rounded-none"
							style={{ aspectRatio: THUMBNAIL_ASPECT_RATIO }}
						/>
						<div className="flex flex-col gap-2 border-border/60 border-t px-3 py-2.5">
							<Skeleton className="h-4 w-2/3" />
							<Skeleton className="h-3 w-1/3" />
						</div>
					</div>
				))}
			</div>
		);
	}

	if (error) {
		return <p className="mt-6 text-muted-foreground text-sm">{error}</p>;
	}

	if (pages.length === 0) {
		if (!hasFilters) {
			return <PagesEmptyState onCreate={onCreate} isCreating={isCreating} />;
		}
		return (
			<Empty className="my-auto min-h-80 items-start border-0 px-0 py-20 text-left max-w-md mx-auto w-full md:px-0 md:py-20">
				<EmptyHeader className="items-start text-left">
					<EmptyMedia variant="icon">
						<LuSearchX className="size-5" />
					</EmptyMedia>
					<EmptyTitle>
						<Trans>No pages match</Trans>
					</EmptyTitle>
					<EmptyDescription>
						<Trans>Try a different search or filter.</Trans>
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{pages.map((page) => (
				<PageCard
					key={page.id}
					page={page}
					isPinned={pinnedPageIds.has(page.id)}
					currentUserId={currentUserId}
					onOpen={onOpen}
					onTogglePin={onTogglePin}
					onDelete={onDelete}
				/>
			))}
		</div>
	);
}
