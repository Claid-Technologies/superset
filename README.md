# Evidence: mobile never-connected vs offline host

Branch: `mobile-host-never-connected-setup`

`host-states-e2e.jpg`: the real Home screen on an iPhone 17 Pro simulator (iOS 26.5), signed in against a local API and the local relay worker. Left to right: a host registered through `host.ensure` that never opened a tunnel; the same screen seconds after a control socket connected as that host; after the socket closed; and with a second host registered, which adds Switch host.

`host-states.jpg`: the earlier fixed-props capture, including the presence-unavailable state.
