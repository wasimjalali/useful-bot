# Review loop hardening report

Branch: `fix/audit-hardening`, isolated git worktree, based on `main`.
Executed: 2026-09-14. Repository: useful-bot (private).

The `feat/native-brand-integration` branch, which another agent was editing at
the time, was not touched during the audit. That work later landed as PR #25
and was merged into this branch on purpose, see "Brand release" below.

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
| 1 | Area reviews, read only, findings with file:line and evidence | `opencode-go/muse-spark-1.3-contributor --variant max --agent plan` | 6 reviewers |
| 2 | Patching, one isolated worktree per area | `opencode-go/deepseek-v4.1-flash --agent build` | 6 patchers |
| 3 | Verification: classify every round 1 finding, hunt regressions | Muse Spark 1.3 contributor, max | 6 reviewers |
| 4 | Residual patching after round 3 | `opencode-go/deepseek-v4.1-flash` | 5 patchers |
| 5 | Final verification across all six areas | Muse Spark 1.3 contributor, max | 6 reviewers |
| 6 | Router-only patch and re-verification after round 5 residuals | both models | 1 each |

The reviewer is always read only. Patching always happens on a separate
worktree and branch (`fix/audit-<area>`, `fix/audit2-<area>`,
`fix/audit3-<area>`) so parallel patchers cannot collide.

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

## Round 2 (patches)

| Area | Fixed | Rejected (with evidence) | Deferred minor | Deferred nit | Commits |
|---|---:|---:|---:|---:|---:|
| Router and gateway | 16 | 8 sub-parts | 2 | 3 | 4 |
| Agent core | 21 | 1 | 1 | 0 | 7 |
| Web API | 18 | 0 | 0 | 1 | 10 |
| Frontend UI/UX | 15 | 2 | 1 | 0 | 6 |
| macOS shell | 13 | 1 | 6 | 2 | 3 |
| Ops and scripts | 17 | 0 | 3 | 1 | 8 |
| **Total** | **100** | **12** | **13** | **7** | **38** |

Merged with `--no-ff` in merges `0ec9e31`, `76213c9`, `7c7ed38`, `d163f1f`,
`ac6a49a`, `50d91bf`. Four files conflicted because two areas hardened the
same code independently (`agent/lib/approvals.ts`, `shared/attachments.ts`
and the two matching test files); both fix sets were combined by hand.

## Round 3 (verification)

| Area | Verdict | Open items after round 3 |
|---|---|---|
| Frontend UI/UX | merge-ready | none |
| Agent core | not merge-ready | 2 new majors (secret tripwire false positives, strict note-id validation poisoning reads) |
| Web API | not merge-ready | 2 new majors (chunked multipart bypass, raw errors on approvals route) |
| macOS shell | not merge-ready | partial items (distinct node error, keychain failure mapping, process retention, avatar decode, polling backoff) |
| Ops and scripts | not merge-ready | release gate missing suites, temp dir cleanup, keychain account match |
| Router and gateway | not merge-ready | effort leak, aggregate label, streaming deadlines, unknown parameter validation, atomic reservation |

Cross-area fix from round 1: the reviewer route now sends the required
`x-useful-*` UUID headers (`04c5601`).

## Round 4 (residual patches)

| Area | Fixed (approx, as reported) | Owner decisions carried | Commits |
|---|---:|---:|---:|
| Router and gateway | 11 | 5 | 4 |
| Agent core | 7 | 2 | 4 |
| Web API | 8 | 1 | 5 |
| macOS shell | 11 | 2 | 5 |
| Ops and scripts | 5 | 3 | 4 |
| **Total** | **42** | **13** | **22** |

Merges: `9c48ce0`, `97015de`, `61a5326`, `049b94c`, `c567dd7`.

## Brand release

PR #25 (approved branding, bright head-only avatars) merged into main while
this loop was running. It was merged into this branch (`e90b7e7`) so the audit
branch cannot revert it. Conflicts resolved by keeping the branding as the
source of truth for user-facing surfaces:

- `macos/build-app.sh` and `macos/Makefile`: brand asset copies from `brand/`
  kept, plus the audit's no `--deep` signing and fail-on-signing-error.
- `web/app/globals.css`: brand avatar color rules kept; dead face-dot rules
  from the pre-branding picker dropped.
- `web/components/bot-face-picker.tsx`: brand color-only picker kept (it
  already uses `role="group"`, so the audit accessibility fix is satisfied).
- `macos/Sources/UsefulBotApp/SettingsPaneView.swift`: brand color-only picker
  kept; the upload path the audit had hardened was removed by the brand.

`npm run brand:check` passes on the merged tree: 89 PNGs, 41 SVG exports,
ICO, ICNS, PWA and Xcode catalogs, silhouette agreement 99.84%.

## Round 5 and 6 (final verification and router patch)

Round 5 gave merge-ready verdicts for agent core, web API, UI/UX, macOS and
ops. The router still reported five majors, all spec-driven:

| Finding | Requirement | Root cause |
|---|---|---|
| B7 | Aggregate 24h caps, `SPEC.md:238` | only per-caller checks existed |
| B8 | Pre-dispatch reservation ledger, `SPEC.md:240` | reservations were never written |
| B9 | Concurrency caps (2 global, 1 per caller), `SPEC.md:238` | no in-flight counters |
| A-11 | Message-shape and tool-schema validation, `SPEC.md:151` | only top-level key checks |
| A-2 | Registry model pinning per `SPEC.md:180` | pinned only when the provider matched |

The round 6 router patch landed four commits (`f1cda7b`, `53384ab`,
`22d4f74`, `108420f`): aggregate caps inside the same immediate transaction,
a reservation ledger with reconciliation and abort retention, global and
per-caller concurrency caps, completion history validation, circuit check
before reservation, a non-stream first-byte deadline, and full registry model
pinning. Final router verification: **merge-ready** (0 blockers, 0 majors).

The final verification left four router minors. Two were fixed directly after
it: the budget precheck now counts the incoming reservation against the cap,
and the SQLite writer sets `PRAGMA busy_timeout=5000` so a held lock waits
instead of surfacing as a 500. The other two are documented: the in-flight
ceiling is per process (the router is a single loopback process), and
`recordUsage` is a test/seed path that live dispatch does not use.

## Gates

| Point in time | TS tests | Swift tests | Other |
|---|---:|---:|---|
| Baseline (before round 1) | 99 | 99 after repairing `macos/test.sh` (`1c448b1`) | typecheck and web build pass |
| After round 2 merge | 149 | 108 | web build pass |
| After brand release merge | 150 | 114 | web build and `brand:check` pass |
| After round 4 merge | 172 | 118 | web build pass |
| After round 6 router patch + minor hardening | 181 | 118 | web build pass |

Every gate ran with Node 24 at `/usr/local/bin/node`. Root and router
typechecks pass at every point.

## Owner decisions

- Router dedup key burn-on-failure is required by `SPEC.md:147`; id-only
  dedup (no session, turn or body binding) is the same contract.
- Router UUID version is not pinned to v4; the contract says UUID.
- Usage summary camelCase token keys are pinned by the macOS and web clients.
- Provider switching can override the registry model when the operator has
  explicitly switched providers; the response now discloses it.
- `bash` approval remains a tripwire, not confinement. True isolation needs
  the certified VM backend the sandbox module refuses to fake.
- macOS secret-name filter deliberately mirrors `shared/attachments.ts`;
  the server re-validates.
- macOS sandbox entitlements are a packaging decision.
- launchd KeepAlive, throttle and log rotation semantics were left unchanged;
  a port preflight was added.
- Supply chain notes (root transitive `sharp` version, no `.npmrc`) need
  dependency or lockfile changes.
- `useful-bot-brand-assets.zip` stays a tracked deliverable.

## Evidence locations

Raw round logs live in `/tmp/ub-audit/`: `review-*.log` (round 1),
`patch-*.log` (round 2), `verify-*.log` (round 3), `patch2-*.log` (round 4),
`verify3-*.log` (round 5), `patch3-router.log` and `verify4-router.log`
(round 6). They are not committed; this file is the durable summary.
