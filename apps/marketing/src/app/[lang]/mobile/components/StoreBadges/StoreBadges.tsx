"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import Image from "next/image";
import { FaGooglePlay } from "react-icons/fa";
import { track } from "@/lib/analytics";
import {
	APP_STORE_BADGE_WIDTHS,
	BADGE_HEIGHT,
	ENGLISH_BADGE_WIDTH,
} from "./constants";

export function StoreBadges() {
	const { t, i18n } = useLingui();
	const localizedWidth = APP_STORE_BADGE_WIDTHS[i18n.locale];
	const badgeLocale = localizedWidth ? i18n.locale : "en";
	const badgeWidth = Math.round(
		((localizedWidth ?? ENGLISH_BADGE_WIDTH) / 40) * BADGE_HEIGHT,
	);

	return (
		<div className="flex flex-col items-start gap-3 sm:flex-row">
			<a
				href={COMPANY.APP_STORE_URL}
				target="_blank"
				rel="noopener noreferrer"
				onClick={() => track("mobile_store_clicked", { store: "app_store" })}
				className="transition-opacity hover:opacity-80"
			>
				<Image
					src={`/badges/app-store/${badgeLocale}.svg`}
					alt={t({ message: "Download on the App Store" })}
					width={badgeWidth}
					height={BADGE_HEIGHT}
					priority
				/>
			</a>
			<a
				href="#android"
				className="flex h-14 items-center gap-3 rounded-[10px] border border-border px-4 text-left text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
			>
				<FaGooglePlay className="size-6 shrink-0" />
				<span>
					<Trans>
						<span className="block text-[11px] leading-tight">
							Coming soon to
						</span>
						<span className="block font-medium text-lg leading-tight">
							Google Play
						</span>
					</Trans>
				</span>
			</a>
		</div>
	);
}
