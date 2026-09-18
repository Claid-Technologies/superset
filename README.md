# Evidence: mobile never-connected vs offline host

Branch: `mobile-host-never-connected-setup`

`host-states.jpg`: left to right, `lastSeenAt` null (never connected), a timestamp 18 minutes old (offline), and absent (presence unavailable). iPhone 17 Pro simulator, iOS 26.5, local Debug dev-client build served by Metro from the PR branch. Mounted through a temporary, uncommitted preview route with fixed props, so the Home header and scope bar are absent and the host name is a placeholder.
