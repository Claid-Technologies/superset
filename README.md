# Evidence: mobile offline host → Remote Access hint

Branch: `mobile-host-offline-remote-access-hint`

`host-offline-view.png` — `HostOfflineView` on an iPhone 17 Pro simulator (iOS 26.5), local Debug dev-client build served by Metro from the PR branch. The component was mounted through a temporary, uncommitted preview route outside the auth groups, so it renders inside the app's real root layout, theme, and i18n provider but without the signed-in Home header. The host name is a placeholder.
