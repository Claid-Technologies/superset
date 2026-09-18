# Evidence: mobile never-connected vs offline host

Branch: `mobile-host-never-connected-setup`. All captures: iPhone 17 Pro simulator, iOS 26.5, real Home screen, signed in against a local API and the local relay worker, with a stand-in host.

- `host-states-e2e.jpg`: never connected, online seconds after the host connects, offline with last seen, and Switch host with a second host.
- `edge-cold-start-before.jpg`: frames from a cold start with the host ONLINE, before the fix. Home paints "is offline" for about half a second.
- `edge-cold-start-after.jpg`: the same cold start after the fix. Splash goes straight to Home.
- `edge-relay-down.jpg`: cold start with the relay unreachable (new "Can't check" screen), then the real offline state after the relay returns and Try again is tapped.
- `edge-long-name.jpg`: a 66-character host name on both screens.
- `edge-locales-large-text.jpg`: German and Japanese setup and offline screens, and English at the largest standard text size.
- `host-states.jpg`: the earlier fixed-props capture.
