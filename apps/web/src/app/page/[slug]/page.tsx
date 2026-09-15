import { msg } from "@lingui/core/macro";
import { pageCommentUser } from "@superset/shared/page-comments";
import {
	AllCommentsButton,
	CommentsPanel,
	PageCommentsView,
} from "@superset/ui/page-comments";
import { TRPCClientError } from "@trpc/client";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { initServerI18n } from "@/lib/i18n-server";
import { api } from "../../../trpc/server";
import { PageCommentsShell } from "./components/PageCommentsShell";
import { PageHeaderBar } from "./components/PageHeaderBar";
import { PageUnavailable } from "./components/PageUnavailable";
import { PublicPageView } from "./components/PublicPageView";
import { WrongOrganization } from "./components/WrongOrganization";
import { getPagesAccess } from "./utils/getPagesAccess";
import { isForbidden, isNotFound } from "./utils/trpcErrors";

interface PageProps {
	params: Promise<{ slug: string }>;
}

// `api()` caches the client, not the result — this cache is what keeps
// generateMetadata and the component to a single pull.
const pullPage = cache(async (slug: string) => {
	const trpc = await api();
	return trpc.page.pull.query({ slug });
});

const pullVersions = cache(async (slug: string) => {
	const trpc = await api();
	return trpc.page.versions.query({ slug });
});

const pullAccess = cache(async (slug: string) => {
	const trpc = await api();
	return trpc.page.access.query({ slug });
});

const pullPublicPage = cache(async (slug: string) => {
	const trpc = await api();
	try {
		return await trpc.page.publicView.query({ slug });
	} catch {
		return null;
	}
});

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { slug } = await params;
	const i18n = await initServerI18n();

	const shared = await pullPublicPage(slug);
	if (shared) {
		const description = shared.description ?? undefined;
		const images = shared.thumbnailUrl
			? [{ url: shared.thumbnailUrl, width: 1280, height: 880 }]
			: undefined;
		return {
			title: shared.title,
			description,
			openGraph: {
				type: "website",
				siteName: "Superset",
				url: shared.url,
				title: shared.title,
				description,
				images,
			},
			twitter: {
				card: images ? "summary_large_image" : "summary",
				title: shared.title,
				description,
				images,
			},
		};
	}

	const { hasPagesAccess } = await getPagesAccess();
	if (hasPagesAccess) {
		const page = await pullPage(slug).catch(() => null);
		if (page) {
			return { title: page.title, description: page.description ?? undefined };
		}
	}

	return {
		title: "Superset",
		description: i18n._(msg({ message: "Sign in to view this page" })),
	};
}

export default async function PublishedPage({ params }: PageProps) {
	const i18n = await initServerI18n();

	const { slug } = await params;

	const { hasPagesAccess, session } = await getPagesAccess();

	const publicView = async () => {
		const shared = await pullPublicPage(slug);
		return shared ? (
			<PublicPageView
				title={shared.title}
				viewUrl={shared.viewUrl}
				slug={slug}
			/>
		) : null;
	};

	if (!hasPagesAccess) {
		const view = await publicView();
		if (view) return view;
		if (session) notFound();
		return <PageUnavailable slug={slug} />;
	}

	let page: Awaited<ReturnType<typeof pullPage>>;
	try {
		page = await pullPage(slug);
	} catch (error) {
		const view = await publicView();
		if (view) return view;
		if (isNotFound(error)) notFound();
		if (isForbidden(error) && error instanceof TRPCClientError) {
			return <WrongOrganization message={error.message} />;
		}
		throw error;
	}

	const [versions, access] = await Promise.all([
		pullVersions(slug),
		pullAccess(slug),
	]);

	return (
		<PageCommentsShell
			pageId={page.id}
			version={page.version}
			pageOwnerId={page.createdByUserId}
			user={pageCommentUser(session, i18n._(msg({ message: "You" })))}
		>
			<div className="flex h-dvh flex-col bg-background">
				<PageHeaderBar
					page={{
						id: page.id,
						title: page.title,
						url: page.url,
						visibility: page.visibility,
						createdByUserId: page.createdByUserId,
						owner: access.owner,
						updatedAt: page.updatedAt,
						sharedVersion: page.sharedVersion,
						latestVersion: page.latestVersion,
						servedVersion: page.servedVersion,
					}}
					versions={versions}
					currentUserId={session?.user.id}
					slug={slug}
					watching={page.watch.watching}
					watchAgentId={page.watch.agentId}
				/>

				<div className="relative flex min-h-0 flex-1">
					<main className="min-h-0 flex-1">
						<PageCommentsView src={page.viewUrl} title={page.title} />
					</main>
					<AllCommentsButton />
					<CommentsPanel servedVersion={page.version} />
				</div>
			</div>
		</PageCommentsShell>
	);
}
