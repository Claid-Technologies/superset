# Sandbox implementation and test checklist

Status: written 2026-09-13 after the layout decisions (`plans/20260913-sandbox-layout-decisions.md`)
and the start-time plan (`plans/20260913-sandbox-start-time.md`). One section per PR, in
dependency order; each lists what is built, what is tested, how the test runs, and what counts
as evidence. Boxes get ticked as they land. Nothing is "done" without its evidence line.

## Access and provisioning

Checked 2026-09-13 on this machine; values never printed, names only.

| Need | State | Action |
| --- | --- | --- |
| Docker daemon (image builds, boot-twice test) | Docker Desktop installed; started it | none |
| Vercel CLI login | logged in as saddlepaddle | none |
| Dev sandbox token → project `sandboxes` | `VERCEL_SANDBOX_TOKEN/TEAM_ID/PROJECT_ID` in `.env`; projects API answers 200 | none |
| Vercel container registry push | `vercel vcr login docker --project <id> --scope <team>` (12 h) | run at first image build |
| GitHub CLI | logged in, scopes repo/workflow | none |
| GitHub App (installation tokens) | `GH_APP_ID/PRIVATE_KEY/SLUG` in `.env` and CI | none |
| CI secrets for the release job (Decision 22) | `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `VERCEL_SANDBOX_*`, `CDN_R2_*` exist | none |
| R2 bucket `superset-cdn` + custom domain `cdn.superset.sh` (Decision 23) | **done 2026-09-13** via the dashboard over CDP: bucket in WNAM, custom domain connected (CNAME `cdn`, public access enabled), account API token `superset-cdn (bundle + assets publisher)` with Object Read & Write on that bucket only; keys in the worktree `.env` and repo secrets as `CDN_R2_ACCESS_KEY_ID`, `CDN_R2_SECRET_ACCESS_KEY`, `CDN_R2_ENDPOINT`, `CDN_R2_BUCKET`, `CDN_URL`; the existing `R2_*` keys are the usercontent token and cannot write here | none |
| Production sandboxes project + internal org id | `SUPERSET_INTERNAL_ORGANIZATION_ID` needed by the release; prod has no internal environment row yet | **Satya**: confirm the CI `VERCEL_SANDBOX_*` secrets are the production project, and give the production internal organization id when the release runs |
| Claude OAuth grant for the brokered token (Decision 2) | no PKCE or refresh flow exists in the code yet; access-token lifetime unverified | built in PR 4; Satya signs in once on dev to measure `expires_in` |
| Neon branch for migrations | `NEON_API_KEY/PROJECT_ID` in `.env` | per `db-migrations` skill, per PR that migrates |

## PR 1 — P0 measurement

Build
- [ ] `start.sh` stamps every phase to the boot log with millisecond timestamps (today's script, before the runner replaces it).
- [ ] host-service `health.check` returns the boot stamps and the runtime version.
- [ ] API records job stamps on the row: job start, fork start and end, boot fired, first 200.
- [ ] Desktop emits `cloud_workspace_opened` with create→ready and ready→first-200.
- [ ] `scripts/sandbox/measure.ts`: five creates and five reopens on the dev golden, prints the table.

Test
- [ ] Unit: health route serialises stamps; the desktop event carries both durations.
- [ ] Real: run `measure.ts` against dev; every stage in the start-time plan's table has a number.

Evidence: the table pasted into the start-time plan, replacing the ~ entries.

## PR 2 — `packages/sandbox`

Build
- [ ] Move `scripts/sandbox/*` to `packages/sandbox/` with the layout on the page: `image.ts`, `build.ts`, `environments/`, `bundle/{setup, assets.json, steps.json, steps/, rootfs/}`, `README.md`.
- [ ] `rootfs/` carries every file that lands on the box at its absolute path; the heredocs in `image.ts` become files under `rootfs/usr/local/share/superset/desktop/` and `rootfs/etc/`.
- [ ] `setup` runner: `apply-rootfs` (hash-compare per file, `.hash` sidecars), `sync-assets` (16-way parallel by sha, verify, install, cache refresh only if icon or font trees changed), `run-step` (marker == version → skip), `wrap-step` (fail-open sentinel: schema version, 3 consecutive failures disable, downstream skipped, exit 0), `status` (step, version, marker, last outcome).
- [ ] `steps.json` → derived versions: sha256(script + declared asset shas + versions of `after` steps + `salt`).
- [ ] `assets.json` rows: Chrome deb (pinned, mirrored), theme tarballs (prebuilt once), fonts (individual ttfs), wallpapers (pre-cropped), host-service tarball (row rewritten by release only; records Node major).
- [ ] Steps: install-chrome, configure-chrome (`after` install-chrome; two profiles), install-themes, install-fonts, install-locales, write-desktop-config (input `sandbox.conf`), install-host (ABI check, flip `current`, keep previous, GC).
- [ ] `build.ts`: hash `rootfs/` → `tools.tsv`; compile `assets.json` → `assets.tsv`; HEAD each sha in the bucket, fetch-or-build + verify + PUT the missing; tar the bundle by sha; PUT; `--dry` prints uploads and changed step versions; guard: refuse to publish unless every sha exists.
- [ ] `sandbox:pin <asset> <url>`: download, hash, rewrite the row.
- [ ] `image.ts`: `USER ubuntu` with NOPASSWD sudo, home `/home/ubuntu`; COPY the bundle; run `setup apply-rootfs`, `sync-assets`, every step at build; bake the bundle at `/opt/superset/bundle/<sha>` with `current`; no `curl` without a checksum anywhere.
- [ ] Contract: `packages/shared/src/sandbox-contract.ts` (zod: identity file, env push, ports, paths, contract version); `build.ts` renders the shell constants into `rootfs/etc/superset/contract.sh`.

Test
- [ ] Unit (`bun test`): derived versions change when and only when script, declared asset, upstream version or salt changes; `tools.tsv` is a pure function of `rootfs/`; `assets.tsv` rows and URLs; contract rendering round-trips.
- [ ] Runner (bash, in a Debian container): apply-rootfs installs then skips; sync-assets against a local HTTP server of hashed files verifies and refuses a bad hash; run-step skips on a matching marker; wrap-step records the sentinel, disables after 3, skips downstream, clears on success, always exits 0.
- [ ] Boot-twice (Docker, CI on every PR): build the image, start a container, run `superset-boot` (with a stub `runCommand` env) twice; second run: zero files installed, zero assets fetched, every step skipped, host-service answers on 4879, websockify listens on 6080; total second-boot time recorded.
- [ ] Bucket (dev): `build.ts` publishes to `cdn.superset.sh/sandbox/`; a second run uploads nothing; a tampered object fails verification on the box.

Evidence: CI green with the boot-twice job's log showing all skips; `build.ts --dry` output on the PR.

## PR 3 — Boot runner and desktop

Build
- [ ] `superset-boot` (root): clear `/run/superset`; source `contract.sh` and `sandbox.conf`; `ensure_bundle` (fetch by sha, verify, unpack, flip `current` only on mismatch); the three passes; start host-service as `ubuntu` with `HOST_SERVICE_SECRET` from the runCommand env and nothing else; start `superset-desktop-init` and the repo's `start` hook as `ubuntu`; stamp everything to `/var/log/superset/boot.log`.
- [ ] `superset-desktop-init` (ubuntu): port of the reference entrypoint: D-Bus, X socket dir, xstartup, Xvnc on :1 localhost no auth, wait for X → `display.ready`, websockify on 6080 → VNC, dock respawn loop waiting on `_NET_SUPPORTING_WM_CHECK`, wallpaper by workspace id via `xfconf-query`, stays resident, dumps diagnostics on failure.
- [ ] host-service in sandbox mode: reads `sandbox.conf`, listens on 4879, pid + ready flags in `/run/superset`, ptyd socket at `/run/superset/ptyd.sock`, state in `/var/lib/superset`, logs to `/var/log/superset/host-service.log`; the desktop VNC route removed.
- [ ] `start` hook runs after host-service is ready; Docker never started by the platform.
- [ ] Failure: host-service not up after the wait → boot continues, logs it; the API marks the workspace failed (Decision 21).

Test
- [ ] Boot-twice job extended: `/run/superset` recreated each boot; stale pid/ready from a previous run ignored; `display.ready` appears; websockify answers a WebSocket upgrade; `ptyd.sock` exists under `/run/superset`.
- [ ] Ordering: host-service answers before the desktop is up (timestamps in boot.log).
- [ ] Failure path: with host-service deliberately broken, boot exits 0, desktop still comes up, boot.log names the failure.
- [ ] Real sandbox (on demand): wake restores the disk, `/run/superset` is clean, second wake skips every step; desktop pane connects through the gate with a per-port ticket to 6080.

Evidence: boot.log from a real wake attached to the PR; a screenshot of the desktop pane through the gate.

## PR 4 — Control plane

Build
- [ ] `sandbox.conf` written at claim and rewritten on wake (identity half appended to the bundle's static half); `SUPERSET_BUNDLE_SHA` from the environment row.
- [ ] Boot started via `runCommand` with `HOST_SERVICE_SECRET` in its env; no secret in create-time env, no secret files.
- [ ] Env push: host-service procedure `environment.set` (replace the managed set); called at claim and wake with the full set, at release with empty; new terminals inherit; open ones unchanged.
- [ ] Header rules for every credential: GitHub installation token (github.com + api.github.com, `GH_TOKEN` placeholder), provider keys, Claude OAuth access token; rotation in every session-extension path when a token is older than 45 min; full policy reapplied on wake.
- [ ] Claude OAuth: PKCE sign-in, refresh token encrypted per user, access token minted on rotation; `expires_in` recorded (the lifetime check).
- [ ] `config.json`: `start` and `ports` keys read; environment-row override; ports declared on the sandbox; the access mint issues a ticket per port.
- [ ] Environment rows: `bundle_sha`, `hooks_override` columns (migration on a Neon branch).
- [ ] Workspace status: `failed` when readiness times out; `transition()` helper; provision/delete race closed; `deleted` rows reaped (survey items).
- [ ] Wake path: getOrCreate/onResume replaces the `nc -z || exec start.sh` guard.

Test
- [ ] Unit: policy builder produces the expected rules from a workspace's credentials; rotation picks the stale ones; env push payload from a workspace's variables; `config.json` merge with override; ticket per port.
- [ ] tRPC: `environment.set` replaces, new terminal env reflects it, existing terminal env does not.
- [ ] Real sandbox (on demand): `git fetch` and `gh api` succeed with no token in env or on disk; after 61 minutes the same succeed (rotation happened); claim writes `sandbox.conf`, wake rewrites it; release empties the env.
- [ ] Failed boot: workspace shows failed in the UI, desktop pane still opens.

Evidence: a real-sandbox run log with the rotation timestamps; the OAuth `expires_in` value in the PR.

## PR 5 — Release pipeline

Build
- [ ] CI on merge to main: `build.ts` publishes the bundle; the guard; the step-version diff printed on the PR.
- [ ] Release run: rewrites the host-service row (version, sha, Node major) and republishes the bundle.
- [ ] `sandbox:release`: rebuild the image only if it changed; build the golden with the repo's `setup` hook; probe; write the environment row (bundle sha, golden) directly, only after the probe passes.
- [ ] `workflow_dispatch` job: boots a real dev-project sandbox and runs the real-sandbox checks from PRs 3 and 4.
- [ ] `internal-setup.sh` moves to the internal environment's `setup` override.

Test
- [ ] Dry run of the release against dev writes nothing on a failed probe (previous row intact).
- [ ] Successful dev release: new bundle sha on the row; an existing dev workspace picks it up on its next wake (boot.log shows the fetch and exactly the changed steps).
- [ ] Rollback: point the row at the previous sha; next wake flips `current` with no download.

Evidence: two consecutive dev releases and one rollback, each with the box's boot.log.

## Final acceptance (real sandbox, dev then production)

- [ ] Create → terminal in the time P0 said we'd hit; reopen after a stop within budget.
- [ ] `docs/cloud-sandbox-acceptance.md` re-run end to end on the new layout; `docs/cloud-sandbox-mismatches.md` updated for anything new.
- [ ] Security posture: no credential in `env`, `/proc/<host-service>/environ` (other than the host secret placeholder set), or on disk; git and models work; the gate rejects a missing or forged ticket on both ports; the box rejects a request without the host secret on 4879.
- [ ] Desktop: visible Chrome over CDP 9222; a Playwright launch on the private profile opens a second window; take-control not regressed.
- [ ] Production: image push, `sandbox:release --production` with the internal org id, first internal workspace on the new layout, canary release of the desktop that mints per-port tickets.
