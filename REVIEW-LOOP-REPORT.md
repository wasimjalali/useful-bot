# Review loop hardening report

Branch: `fix/audit-hardening`, isolated git worktree, based on `main` at `30abc45`.
Executed: 2026-09-14. Repository: useful-bot (private).

The `feat/native-brand-integration` branch, which another agent was editing at the
time, was not touched. All audit work happened on a separate branch and in
separate worktrees.

## Method

Six areas were reviewed and patched in parallel:

1. Backend router and model gateway
2. Agent core (tools, memory, approvals, sandbox, handoffs)
3. Web API routes
4. Web frontend UI/UX
5. macOS SwiftUI shell
6. Ops, scripts, launchd and supply chain

| Round | What ran | Model | Concurrency |
|---|---|---|---|
| 1 | Area reviews, read only, findings with file:line and evidence | `opencode-go/muse-spark-1.3-contributor --variant max --agent plan` | 6 reviewers in parallel |
| 2 | Patching, one isolated worktree per area (`fix/audit-<area>`) | `opencode-go/deepseek-v4.1-flash --agent build` | 6 patch agents in parallel |
| Merge | Area branches merged into `fix/audit-hardening`, conflicts resolved by hand | orchestrator | sequential |
| 3 | Verification reviews: confirm each fix, hunt regressions | Muse Spark 1.3 contributor, max | 6 reviewers in parallel |

Round 1 prompt contract: read-only, no destructive commands, findings sorted
blocker, major, minor, nit with file:line, evidence, suggested fix, and a
`VERDICT: merge-ready` line.

Round 2 contract: fix or reject with evidence, smallest safe change, add tests
for changed behavior, run the area gates, conventional commits, no lockfile or
secret access.

## Round 1 totals (findings)

| Area | Blocker | Major | Minor | Nit | Total |
|---|---:|---:|---:|---:|---:|
| Router and gateway | 2 | 9 | 7 | 3 | 21 |
| Agent core | 3 | 9 | 9 | 1 | 22 |
| Web API | 2 | 5 | 8 | 4 | 19 |
| Frontend UI/UX | 1 | 6 | 10 | 1 | 18 |
| macOS shell | 0 | 7 | 11 | 4 | 22 |
| Ops and scripts | 0 | 7 | 10 | 3 | 20 |
| **Total** | **8** | **43** | **55** | **16** | **122** |

Notable blockers found: unbounded router SQLite growth with idempotency keys
burned on failure, workspace parent-symlink escape, memory note-id traversal,
a channel that failed open without its secret, usage parsing that stopped at
the first SSE data line, and an eve proxy that accepted any session profile.

## Round 2 totals (patches)

Counts come from the patch agents' own final reports. A finding can be partly
fixed and partly rejected with spec evidence; per-finding status is in the
round logs.

| Area | Fixed | Rejected (with evidence) | Deferred minor | Deferred nit | Commits |
|---|---:|---:|---:|---:|---:|
| Router and gateway | 16 | 8 sub-parts | 2 | 3 | 4 |
| Agent core | 21 | 1 | 1 | 0 | 7 |
| Web API | 18 | 0 | 0 | 1 | 10 |
| Frontend UI/UX | 15 | 2 | 1 | 0 | 6 |
| macOS shell | 13 | 1 | 6 | 2 | 3 |
| Ops and scripts | 17 | 0 | 3 | 1 | 8 |
| **Total** | **100** | **12** | **13** | **7** | **38** |

Rejections were upheld only with concrete evidence, for example the router
idempotency reservation is required by `docs/spec/SPEC.md:147`, and the
upstream-model override is the intended provider-switching feature.

## Merge

Six branches merged with `--no-ff`: `0ec9e31` (macos), `76213c9` (ops),
`7c7ed38` (router), `d163f1f` (ui), `ac6a49a` (webapi), `50d91bf` (agent).
Four files conflicted because two areas hardened the same code independently:
`agent/lib/approvals.ts` (webapi's directory lock plus the agent's boot-epoch
invalidation were combined into one implementation), `shared/attachments.ts`
(longest-run fence sizing plus file-name flattening), and the two matching
test files. Both fix sets survive.

Cross-area bug found by the router reviewer and fixed after the merge:
`web/app/api/reviewer/route.ts` called the router without the required
`x-useful-*` UUID headers, so the live reviewer path would always get 400
(`04c5601`).

## Gates

| Point in time | Command | Result |
|---|---|---|
| Baseline, before round 1 | `npm run typecheck` | pass |
| Baseline, before round 1 | `tsc --noEmit -p router/tsconfig.json` | pass |
| Baseline, before round 1 | `npm test` | 99 pass, 0 fail |
| Baseline, before round 1 | `npm run web:build` | pass |
| Baseline, before round 1 | `macos/test.sh` | 99 pass after repairing the runner (`1c448b1`) |
| After merge, `04c5601` | `npm run typecheck` plus router tsconfig | pass |
| After merge, `04c5601` | `npm test` | 149 pass, 0 fail |
| After merge, `04c5601` | `npm run web:build` | pass |
| After merge, `04c5601` | `macos/test.sh` | 108 pass in 17 suites |

The `macos/test.sh` baseline repair was itself a gate bug: the script did not
copy `lib_TestingInterop.dylib` into the test bundle, so the Swift suite could
not load under Command Line Tools only.

## Round 3 status

Verification reviews are run per area on the merged branch. Each reviewer must
first classify every round 1 finding as fixed, partial, not fixed, or
rejection upheld or overturned, with file:line evidence, before adding new
findings. Results are appended below as they land.

| Round 3 area | Verdict | Blockers | Majors | Notes |
|---|---|---|---|---|
| Router and gateway | pending | | | |
| Agent core | pending | | | |
| Web API | pending | | | |
| Frontend UI/UX | pending | | | |
| macOS shell | pending | | | |
| Ops and scripts | pending | | | |

## Deferred items (owner decision)

- The `bash` approval tool is a tripwire, not confinement. Absolute or
  obfuscated paths can still reach files outside the workspace; the hard
  control remains the owner reading the command in the approval card. True
  isolation needs the certified VM backend the sandbox module refuses to fake.
- Registry `upstreamModelId` versus the active provider picker: the spec
  forbids extra providers, the UI supports them. Either pin aliases to
  opencode-go or advertise the resolved model.
- Router does not reject unknown top-level completion parameters yet
  (`SPEC.md:151`); the live SDK payload needs to be checked first.
- Web API route-level tests for CSRF, origin and rate limiting need a route
  test harness; unit coverage exists for the primitives.
- macOS: spawned servers are unretained, avatar decode runs on the main
  actor, memory and usage polling have no backoff, and sandbox entitlements
  are a packaging decision.
- Ops: launchd KeepAlive semantics, log rotation and port preflight are
  behavior decisions; supply-chain notes (sharp install script, duplicate
  sharp in brand-tools) need dependency changes.
- The web build gate cannot run in a worktree whose `node_modules` is a
  symlink outside the Turbopack root; the merged branch is gated in the main
  audit worktree with a real `node_modules`.

## Evidence locations

The full round logs are not committed. They live in `/tmp/ub-audit/`:
`review-<area>.log` (round 1), `patch-<area>.log` (round 2),
`verify-<area>.log` (round 3). The committed report is this file; the PR body
summarizes it.
