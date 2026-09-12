# Useful Bot

Local-first personal agent on [eve](https://github.com/vercel/eve) 0.54.3. Private repository. Not a Hermes replacement until the seven-day trial in the spec passes.

## Runtime

- Interpreter: `/usr/local/bin/node` (Node 24.11.1). Login-shell `node` on this machine is v22 and must not be used.
- Package manager: npm, exact versions in `package.json`.
- Bind: loopback only. No Vercel hosting.

## Phase status

| Phase | Status |
|---|---|
| 0 spikes S0-S3 | merged (#2) |
| 1.1-1.2 router and agent core | in progress on `feat/pr3-router-agent-core` |
| 1.3 macOS surface | not started |
| 2 daily usefulness | not started |
| 3 phone | not started |

## Commands

```sh
export PATH=/usr/local/bin:$PATH
npm run verify:phase0 -- --case runtime
npm run verify:phase0 -- --case opencode
npm run verify:phase0 -- --case eve
npm run verify:phase0 -- --case sandbox
```

Sleeping the Mac is downtime. Do not claim otherwise.
