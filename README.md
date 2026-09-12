# Useful Bot

Local-first personal agent on [eve](https://github.com/vercel/eve) 0.54.3. Private repository. Not a Hermes replacement until the seven-day trial in the spec passes.

## Runtime

- Interpreter: `/usr/local/bin/node` (Node 24.11.1). Login-shell `node` on this machine is v22 and must not be used.
- Package manager: npm, exact versions in `package.json`.
- Bind: loopback only. No Vercel hosting.

## Phase status

| Phase | Status |
|---|---|
| 0 spikes S0-S3 | in progress on `feat/pr2-phase0-spikes` |
| 1 macOS vertical slice | not started |
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
