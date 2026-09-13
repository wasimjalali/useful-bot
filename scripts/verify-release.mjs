#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const NODE = "/usr/local/bin/node";
const ROOT = dirname(fileURLToPath(new URL(".", import.meta.url)));

if (Number(process.versions.node.split(".")[0]) !== 24) {
  process.stderr.write(`verify-release refuses Node ${process.versions.node}\n`);
  process.exit(2);
}

function run(args, timeoutMs) {
  const result = spawnSync(NODE, args, {
    cwd: ROOT,
    env: { ...process.env, PATH: "/usr/local/bin:/usr/bin:/bin" },
    encoding: "utf8",
    timeout: timeoutMs,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    signal: result.signal,
  };
}

const steps = [];

function step(name, args, timeoutMs) {
  const result = run(args, timeoutMs);
  steps.push({ name, ...result });
  process.stderr.write(`${result.ok ? "PASS" : "FAIL"} ${name}\n`);
  if (!result.ok) {
    writeFileSync(join(ROOT, "release-verify.json"), `${JSON.stringify({ ok: false, steps, skipped: skipped() }, null, 2)}\n`);
    process.exit(1);
  }
}

function skipped() {
  return [
    "swift_macos_tests_linux",
    "live_glm_workhorse",
    "live_glm_reviewer",
    "launchctl_bootstrap",
    "seven_day_trial",
  ];
}

step("tsc", ["node_modules/typescript/bin/tsc", "--noEmit"], 60_000);
step("tsc_web", ["node_modules/typescript/bin/tsc", "--noEmit", "-p", "web/tsconfig.json"], 60_000);
step("unit", [
  "--experimental-strip-types",
  "--test",
  "--test-timeout",
  "15000",
  "test/contracts.test.ts",
  "test/write-approval.test.ts",
  "test/memory.test.ts",
  "test/session-owners.test.ts",
  "test/eve-stream.test.ts",
  "test/shell-store.test.ts",
  "test/approvals-persist.test.ts",
  "test/session-store.test.ts",
  "test/launchd-render.test.ts",
  "spikes/s3/approvals.test.ts",
], 60_000);
step("next_build", ["node_modules/next/dist/bin/next", "build", "web"], 180_000);
step("launchd_render", [
  "--experimental-strip-types",
  "scripts/render-launchd.mjs",
  "--project-root",
  ROOT,
  "--state-root",
  "/tmp/ub-release-state",
  "--out",
  "/tmp/ub-release-launchd",
], 15_000);

const report = {
  ok: true,
  node: process.versions.node,
  interpreter: process.execPath,
  steps,
  skipped: skipped(),
  sevenDayTrial: "not started; cannot complete on day one",
};
writeFileSync(join(ROOT, "release-verify.json"), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, skipped: report.skipped })}\n`);
