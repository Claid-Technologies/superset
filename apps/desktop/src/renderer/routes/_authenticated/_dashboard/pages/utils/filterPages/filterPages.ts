export const PAGE_SCOPES = ["all", "pinned", "team", "mine"] as const;

export type PageScope = (typeof PAGE_SCOPES)[number];

export function isPageScope(value: unknown): value is PageScope {
	return (PAGE_SCOPES as readonly unknown[]).includes(value);
}

export interface FilterablePage {
	id: string;
	title: string;
	slug: string;
	visibility: string;
	description?: string | null;
	createdByUserId?: string | null;
	workspaceLinks?: readonly { workspaceId: string }[];
}

export function matchesSearch(page: FilterablePage, query: string): boolean {
	const needle = query.trim().toLowerCase();
	if (!needle) return true;
	if (page.title.toLowerCase().includes(needle)) return true;
	if (page.slug.toLowerCase().includes(needle)) return true;
	return Boolean(page.description?.toLowerCase().includes(needle));
}

export function matchesScope(
	page: FilterablePage,
	scope: PageScope,
	pinnedPageIds: ReadonlySet<string>,
): boolean {
	switch (scope) {
		case "pinned":
			return pinnedPageIds.has(page.id);
		case "team":
			return page.visibility !== "just_me";
		case "mine":
			return page.visibility === "just_me";
		default:
			return true;
	}
}

export function matchesAuthor(
	page: FilterablePage,
	authorId: string | null,
): boolean {
	if (!authorId) return true;
	return page.createdByUserId === authorId;
}

export function matchesWorkspace(
	page: FilterablePage,
	workspaceId: string | null,
): boolean {
	if (!workspaceId) return true;
	return Boolean(
		page.workspaceLinks?.some((link) => link.workspaceId === workspaceId),
	);
}

export function filterPages<T extends FilterablePage>(
	pages: T[],
	{
		search,
		scope,
		pinnedPageIds,
		authorId = null,
		workspaceId = null,
	}: {
		search: string;
		scope: PageScope;
		pinnedPageIds: ReadonlySet<string>;
		authorId?: string | null;
		workspaceId?: string | null;
	},
): T[] {
	return pages.filter(
		(page) =>
			matchesSearch(page, search) &&
			matchesScope(page, scope, pinnedPageIds) &&
			matchesAuthor(page, authorId) &&
			matchesWorkspace(page, workspaceId),
	);
}

export function sortPinnedFirst<T extends FilterablePage>(
	pages: T[],
	pinnedPageIds: ReadonlySet<string>,
): T[] {
	return [...pages].sort((a, b) => {
		const aPinned = pinnedPageIds.has(a.id) ? 0 : 1;
		const bPinned = pinnedPageIds.has(b.id) ? 0 : 1;
		return aPinned - bPinned;
	});
}
