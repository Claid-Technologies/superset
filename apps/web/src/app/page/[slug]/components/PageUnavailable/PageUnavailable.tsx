import { msg } from "@lingui/core/macro";
import { Button } from "@superset/ui/button";
import { Pixel404 } from "@superset/ui/pixel-404";
import Link from "next/link";
import { MessageScreen } from "@/components/MessageScreen";
import { initServerI18n } from "@/lib/i18n-server";

interface PageUnavailableProps {
	slug: string;
}

export async function PageUnavailable({ slug }: PageUnavailableProps) {
	const i18n = await initServerI18n();

	return (
		<MessageScreen
			graphic={<Pixel404 className="max-w-[260px] text-foreground" />}
			title={i18n._(msg({ message: "This page isn't here" }))}
			description={i18n._(
				msg({
					message:
						"The link may be wrong, the page may have been deleted, or you may not have access to it.",
				}),
			)}
			action={
				<Button asChild size="sm">
					<Link href={`/sign-in?redirect=/page/${slug}`}>
						{i18n._(msg({ message: "Sign in" }))}
					</Link>
				</Button>
			}
		/>
	);
}
