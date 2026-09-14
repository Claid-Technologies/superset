# Sandbox start time — proposed

Status: proposed, 2026-09-13. Owner: cloud workspaces. Goal: a new cloud
workspace shows a live terminal in under 3 seconds; a reopened one in under 8.

## Where the time goes today

Create-to-terminal is ~12 s. Measured pieces, from the release probe and the
dev stack logs; anything marked ~ is inferred and P0 replaces it with a number.

| Stage | Where | Today |
| --- | --- | --- |
| `cloudWorkspace.create` writes the row, nudges | API | 0.3 s |
| QStash publish → provision job (prod only; dev is inline) | API | ~1 s |
| Name from the model, alongside clone lookup and environment | job | 0.7 s, on the critical path |
| `Sandbox.fork` from the golden, identity in the config env | Vercel | ~6 s (their floor) |
| Write `/data/environment.env`, fire `start.sh` detached | job | <0.5 s |
| Row → `ready`, nudge; client refetches list | API + client | ≤1 s |
| Access mint with wake → `Sandbox.get`, extend, wait for health | API | poll 1 s granularity |
| `start.sh`: env, host.db copy, `git fetch --depth 1` + checkout, `dockerd`, Xvnc + xfce, **then** `node host-service.js` | sandbox | ~10–12 s from fork return to first 200 |
| Panes connect through the gate, agent launches | client + sandbox | ~1 s |

Two structural facts drive the plan: the identity of a workspace rides in the
sandbox's create-time env, so nothing can exist before the create call; and
host-service is the last thing the boot script starts.

## Plan, one PR each

**P0 — Measure.** One trace per create. `start.sh` stamps every step to
`/data/boot.log` with millisecond timestamps (it writes one line today);
host-service reports the boot stamps on `health.check`; the API records
job-side stamps (job start, fork start/end, start fired) on the row; the
desktop emits `cloud_workspace_opened` with create→ready, ready→first-200
durations. Deliverable: a table like the one above with numbers from five
creates and five reopens. Nothing below ships without it.

**P1 — host-service first.** Reorder `start.sh`: source env, copy host.db,
start host-service at once; the branch checkout, `dockerd` and the display are
side effects that run after it, each waiting on its own precondition rather
than on a script position (the display already waits for X; Docker waits for
nothing and should not start until a workspace asks — the reference runs the
daemon from a per-workspace start hook, never from platform boot). Replace the
30-line xfconf XML written per boot with one `xfconf-query` after the window
manager is up. host-service already tolerates the workspace appearing late for
a clone; verify it does for a fetch-and-checkout on the baked repo. Expected:
−3 to −5 s on every create and every wake.

**P2 — Name off the critical path.** The model-generated name reaches the
sandbox only to name host-service's fabricated workspace row, which nothing
user-facing reads. Drop `SUPERSET_SANDBOX_WORKSPACE_NAME`, let that row be
"workspace", and generate the name where the API writes its own row, off the
provisioning path. The fork starts the moment the job does. Same PR: build
the sandbox's env in one place (`sandboxWorkspaceEnv()`), used by provisioning
and the release probe, which today spell it by hand. Expected: −0.7 s
typical, more when the model is slow.

**P3 — Push, not poll; readiness from the thing that is ready.** `ready`
already nudges; the client refetches on it and mints with wake at once. The
API resumes, fires boot and returns the ticket immediately; the access
provider polls `health.check` through the gate every 250 ms and publishes the
address on the first 200, so the API holds no 60-second function and has no
timeout path. Same PR: the provision job runs under `waitUntil` from
`@vercel/functions` instead of a QStash hop, one code path in dev and prod;
a row still `provisioning` after two minutes is swept to `failed` (P4's
helper). Expected: −1 to −3 s.

**P4 — Let the SDK own resume.** `Sandbox.getOrCreate` by name with the
`onCreate` hook for first boot and the resume path for wakes replaces our
`nc -z || exec start.sh` guard and the recomputed `sandboxNameFor`. Same PR:
status transitions through one `transition(from, to)` helper, which closes the
provision-versus-delete race and the never-reaped `deleted` rows. Cleanup, not
speed; it makes P5 safe.

**P5 — Warm pool.** With identity delivered as a file (P2) and boot ordered
(P1), a sandbox can exist before anyone asks for it. Keep N forks of the active
golden per environment already booted to "host-service listening, no
identity"; create becomes claim: write the identity file, tell host-service to
self-seed, check out the branch. A running pool member makes create ≈ 2–3 s;
a stopped one costs a resume (≈ the fork floor) but nothing idle. Pick N and
running-vs-stopped from P0's numbers and Vercel's per-second CPU and memory
billing; start with one running member per environment with a short idle stop.

## Borrowed from the reference machine

Its boot scripts were captured on the anatomy page. What transfers: the
runtime and the desktop start in parallel and the desktop never gates the
runtime (P1); Docker is a per-workspace opt-in start hook, not platform boot
(P1, and later a per-workspace `install`/`start` layer we lack entirely); the
checkout is baked and the branch is chosen at claim (P2, P5); each service
signals its own readiness (P3); every phase is logged with millisecond stamps
(P0); one config file for every display number, applied at build time and only
sourced at boot; scripts shipped as files with a hashed manifest and a named
step registry with per-step version markers and a fail-open sentinel that
disables a step after three consecutive failures (the survey's "scripts as
files" item, alongside P4). What does not: a runtime downloaded per boot and a
provisioner that reconciles any image to spec, both of which exist because
that platform has a supervisor and user-built images; a Vercel snapshot is
already the cache, and our image rebuild is the release.

## Not in scope

Vercel's fork and resume floor; the relay; the desktop pane's own start. The
gate is done (#7467) and unaffected by any of this.
