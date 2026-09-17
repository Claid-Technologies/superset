import { useLingui } from "@lingui/react/macro";
import { Switch } from "@superset/ui/switch";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettings } from "renderer/stores/settings";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

export function BranchNameInputSection() {
	const { t } = useLingui();
	const enabled = useSettings((state) => state.showBranchNameInput);
	const update = useSettings((state) => state.update);
	const searchQuery = useSettingsSearchQuery();

	return (
		<div className="flex items-center justify-between gap-8 py-2.5">
			<div className="min-w-0 flex-1">
				<label htmlFor="show-branch-name-input" className="text-sm font-medium">
					<HighlightText
						text={t({ message: "Show custom branch name input" })}
						query={searchQuery}
					/>
				</label>
				<div
					id="show-branch-name-input-description"
					className="text-xs text-muted-foreground"
				>
					<HighlightText
						text={t({
							message:
								"Show a branch name field above the workspace creation prompt",
						})}
						query={searchQuery}
					/>
				</div>
			</div>
			<Switch
				id="show-branch-name-input"
				aria-describedby="show-branch-name-input-description"
				checked={enabled}
				onCheckedChange={(checked) => update("showBranchNameInput", checked)}
			/>
		</div>
	);
}
