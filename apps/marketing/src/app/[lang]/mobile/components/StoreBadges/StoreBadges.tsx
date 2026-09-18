"use client";

import { Trans } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import { FaApple, FaGooglePlay } from "react-icons/fa";
import { track } from "@/lib/analytics";

const BADGE_CLASS =
	"flex h-14 w-full items-center gap-3 px-5 text-left transition-colors sm:w-auto sm:min-w-[11.5rem]";
const BADGE_KICKER_CLASS = "block text-[11px] leading-tight";
const BADGE_STORE_CLASS = "block font-medium text-lg leading-tight";

export function StoreBadges() {
	return (
		<div className="flex flex-col gap-3 sm:flex-row">
			<a
				href={COMPANY.APP_STORE_URL}
				target="_blank"
				rel="noopener noreferrer"
				onClick={() => track("mobile_store_clicked", { store: "app_store" })}
				className={`${BADGE_CLASS} bg-foreground text-background hover:bg-brand hover:text-white`}
			>
				<FaApple className="size-7 shrink-0" />
				<span>
					<Trans>
						<span className={BADGE_KICKER_CLASS}>Download on the</span>
						<span className={BADGE_STORE_CLASS}>App Store</span>
					</Trans>
				</span>
			</a>
			<a
				href="#android"
				className={`${BADGE_CLASS} border border-border text-muted-foreground hover:border-foreground hover:text-foreground`}
			>
				<FaGooglePlay className="size-6 shrink-0" />
				<span>
					<Trans>
						<span className={BADGE_KICKER_CLASS}>Coming soon to</span>
						<span className={BADGE_STORE_CLASS}>Google Play</span>
					</Trans>
				</span>
			</a>
		</div>
	);
}
