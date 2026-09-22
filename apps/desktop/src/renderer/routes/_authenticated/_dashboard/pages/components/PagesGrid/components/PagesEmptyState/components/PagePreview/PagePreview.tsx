import { Trans } from "@lingui/react/macro";
import { LuMessageSquare } from "react-icons/lu";
import { THUMBNAIL_ASPECT_RATIO } from "../../../../constants";

const CHART_BARS = [
	{ key: "bar-1", height: "34%" },
	{ key: "bar-2", height: "58%" },
	{ key: "bar-3", height: "45%" },
	{ key: "bar-4", height: "71%" },
	{ key: "bar-5", height: "52%" },
	{ key: "bar-6", height: "88%" },
	{ key: "bar-7", height: "64%" },
	{ key: "bar-8", height: "97%" },
	{ key: "bar-9", height: "76%" },
];

const LEAD_LINES = [
	{ key: "lead-1", width: "100%" },
	{ key: "lead-2", width: "93%" },
	{ key: "lead-3", width: "58%" },
];

const STAT_TILES = [
	{ key: "stat-1", valueWidth: "2rem", captionWidth: "70%" },
	{ key: "stat-2", valueWidth: "1.5rem", captionWidth: "55%" },
	{ key: "stat-3", valueWidth: "2.5rem", captionWidth: "80%" },
];

const CLOSING_LINES = [
	{ key: "closing-1", width: "88%" },
	{ key: "closing-2", width: "44%" },
];

const TEXT_LINE_CLASS = "h-1 rounded-full bg-muted-foreground/30";

export function PagePreview() {
	return (
		<div className="overflow-hidden rounded-lg border border-border bg-background">
			<div
				className="relative w-full overflow-hidden bg-muted/30"
				style={{ aspectRatio: THUMBNAIL_ASPECT_RATIO }}
			>
				<div className="absolute inset-0 flex flex-col gap-3 p-6">
					<span className="text-[10px] text-muted-foreground uppercase tracking-widest">
						<Trans>Engineering</Trans>
					</span>
					<div className="flex items-center justify-between gap-3">
						<span className="font-medium text-foreground text-sm tracking-tight">
							<Trans>Auth refactor, before and after</Trans>
						</span>
						<span className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 shadow-sm">
							<LuMessageSquare className="size-3 text-muted-foreground" />
							<span className="text-[10px] text-muted-foreground tabular-nums">
								2
							</span>
						</span>
					</div>
					<div className="flex flex-col gap-1.5">
						{LEAD_LINES.map(({ key, width }) => (
							<div key={key} className={TEXT_LINE_CLASS} style={{ width }} />
						))}
					</div>
					<div className="grid grid-cols-3 gap-2">
						{STAT_TILES.map(({ key, valueWidth, captionWidth }) => (
							<div
								key={key}
								className="flex flex-col gap-1.5 rounded-md border border-border/60 px-2 py-2"
							>
								<div
									className="h-2 rounded-sm bg-foreground/40"
									style={{ width: valueWidth }}
								/>
								<div
									className={TEXT_LINE_CLASS}
									style={{ width: captionWidth }}
								/>
							</div>
						))}
					</div>
					<div className="flex min-h-0 flex-1 items-end gap-1.5">
						{CHART_BARS.map(({ key, height }) => (
							<div
								key={key}
								className="flex-1 rounded-sm bg-foreground/15"
								style={{ height }}
							/>
						))}
					</div>
					<div className="flex flex-col gap-1.5">
						{CLOSING_LINES.map(({ key, width }) => (
							<div key={key} className={TEXT_LINE_CLASS} style={{ width }} />
						))}
					</div>
				</div>
			</div>
			<div className="flex items-center justify-between gap-2 border-border/60 border-t px-3 py-2">
				<span className="truncate text-foreground text-xs">
					<Trans>Auth refactor, before and after</Trans>
				</span>
				<span className="shrink-0 text-[10px] text-muted-foreground">
					<Trans>Version 3</Trans>
				</span>
			</div>
		</div>
	);
}
