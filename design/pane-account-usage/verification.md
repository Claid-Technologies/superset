# Pane account usage verification

Implemented in the `bottled-verse` worktree. Desktop renderer: `http://localhost:6825`; CDP: `6829`; API: `http://localhost:6821`. Verified the authenticated organization through the app's normal auth client before UI testing.

## Real desktop journey

- Opened this workspace through the sidebar. Before launching an agent, no usage icon was present.
- Launched Claude through the visible agent toolbar. The header progress ring appeared with live account quota data.
- Clicked the progress ring using CDP mouse input. The popover showed the matched account, all returned windows, reset times, observation time and View usage.
- Clicked View usage. The route became `/settings/usage` with this workspace ID, the matched account key and agent. The corresponding account card received focus, scrolled into view and displayed a highlight.
- Clicked Settings Back. Returned to the same workspace and agent pane with the progress ring present. Repeated the drilldown successfully.
- Host rebuilds invalidated runtime attribution; existing sessions did not silently receive the current default account's quota. New agent launches restored attribution.

The three PNGs are real desktop captures, clipped to relevant UI regions without rearranging the pane layout. The popover email was visually obscured only while capturing; the Usage page used its existing Hide emails control. No balances or percentages were replaced. The design's values are fictional and intentionally differ from the implementation captures.

## Automated checks

- Desktop and host-service typechecks passed.
- `bun run check:i18n` passed for all 17 shipping locales.
- Targeted suites cover terminal binding lifecycle, notification delivery, agent wrappers, login identity, and pane quota selection. The main run passed 190 tests; the follow-up hook suite passed 52, including two additional metadata tests.
- Identity tests cover OAuth token rotation, different people sharing a Codex account, Claude account changes, and missing/malformed sign-in data.
- Pane state tests cover default-account isolation, mismatched cached identities, API billing, stale/reset windows, model-scoped limits and unavailable providers.
- Hook tests verify that login metadata handles quoted paths, preserves launch identifiers and never transmits API key values.

## Scope and limits

Live end-to-end coverage used Claude. Codex attribution is implemented and tested with synthetic identity fixtures, but live Codex login navigation was not exercised. Native chat panes and other providers retain fallback behavior. Runtime attribution is deliberately not persisted across host restarts; an unverified session must relaunch before displaying its login's quota. Provider endpoints remain undocumented and quota refreshes reuse the existing five-minute cache.

## Progress ring refinement

The ready state now renders usage as a clockwise progress ring. Live desktop inspection confirmed the normal ring button and adjacent header button have identical computed colors. Clicking the ring opened the account popover successfully. Header and popover screenshots were refreshed from the running app. Warning colors remain amber at 70% and red at 90%; these thresholds were checked in code.
