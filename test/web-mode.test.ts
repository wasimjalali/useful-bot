import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
// @ts-expect-error plain ESM launcher module, no types
import { webLaunch } from "../scripts/web-mode.mjs";

function checkout(): string {
  const root = mkdtempSync(join(tmpdir(), "ub-web-mode-"));
  const at = (file: string, seconds: number) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), "x");
    utimesSync(join(root, file), seconds, seconds);
  };
  at("web/app/page.tsx", 1000);
  at("shared/models.ts", 1000);
  at("web/.next/standalone/web/server.js", 2000);
  at("web/.next/standalone/web/.next/static/chunk.js", 2000);
  at("web/.next/BUILD_ID", 2000);
  return root;
}

test("a build newer than its sources is served", () => {
  const root = checkout();
  const launch = webLaunch(root, {});
  assert.equal(launch.mode, "production");
  assert.equal(launch.server, join(root, "web/.next/standalone/web/server.js"));
});

test("a source edited after the build sends the service back to next dev", () => {
  const root = checkout();
  utimesSync(join(root, "shared/models.ts"), 3000, 3000);
  assert.deepEqual(webLaunch(root, {}), { mode: "dev", reason: "web_build_stale" });
});

test("no build, or one without its static files, runs next dev", () => {
  const root = mkdtempSync(join(tmpdir(), "ub-web-mode-"));
  assert.deepEqual(webLaunch(root, {}), { mode: "dev", reason: "web_build_missing" });
});

test("UB_WEB_MODE=dev wins over a fresh build", () => {
  assert.deepEqual(webLaunch(checkout(), { UB_WEB_MODE: "dev" }), { mode: "dev", reason: "UB_WEB_MODE=dev" });
});
