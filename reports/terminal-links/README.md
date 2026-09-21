# Terminal link verification

Published report: https://app.superset.sh/page/terminal-links-boundaries-fixed-12sspz

`index.html` is the self-contained source, with screenshots and every case result
embedded. Republish this path in workspace
`bc03aabf-92c3-4578-a27c-f288fc402bda` to version the same page, or pass
`--page 5ba68a87-6ab7-456d-a716-9bbb141b4231` explicitly.

- `case-results.json`: individual before/after results from the same final suite.
- `browser-evidence.json`: actual mouse-hover and click destinations, with ranges.
- `before-hover.png`, `after-hover.png`: browser xterm component harness screenshots.
- `page-verification.json`: offline report rendering, filters, images, and mobile width.
- `report-preview.png`: local offline report preview.
- `verification-summary.json`: counts, baseline commit, and published content hash.

The baseline provider and its multiline helper came from commit
`b18f5f50412915e06899a6596968fd1d9af8d2f0`. The same final test suite ran against
that original provider via a temporary import, then against the updated provider.
The imported fixture sources, revisions, adaptations, and exclusions are
recorded beside the URL parser under `utils/url-parser/README.md`.

The browser harness wrote this output to the original and updated providers:

```text
sloyd-web:dev:localhost:    ➜  Local:   http://localhost:3001/
sloyd-web:dev:localhost:    ➜  Network: http://192.168.0.26:3001/
sloyd-web:dev:localhost:    ➜  press h + enter to show help
```

Each line ended with CRLF. Terminal dimensions: 85 columns, 5 rows. Actual CDP
mouse hover and click targeted the first URL; the handler recorded the supplied
destination without launching it. This was a browser component harness, not a
signed-in desktop end-to-end test. No matching desktop dev renderer was running
for this worktree.
