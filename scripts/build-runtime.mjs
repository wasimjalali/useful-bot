#!/usr/bin/env node
// The services a release app carries in Contents/Resources/runtime: the files
// router, web and eve read at runtime, their production dependencies and an
// official Node. The app copies this to ~/Library/Application Support/Useful
// Bot/app and runs it from there (macos/Sources/UsefulBotCore/RuntimeInstall.swift).
//
//   node scripts/build-runtime.mjs <out-dir> <version-stamp>
//
// Run after the web build (macos/build-app.sh does, when UB_RELEASE=1).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.versions.node.split(".")[0] !== "24") {
  // npm builds native addons against the Node that runs it, and the runtime ships Node 24.
  process.stderr.write(`build-runtime needs Node 24, got ${process.versions.node}\n`);
  process.exit(2);
}
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [out, stamp] = process.argv.slice(2);
if (!out || !stamp) {
  process.stderr.write("usage: build-runtime.mjs <out-dir> <version-stamp>\n");
  process.exit(2);
}

// The Node the services require (package.json engines), as nodejs.org ships it.
const NODE_VERSION = "24.11.1";
const NODE_DIST = `node-v${NODE_VERSION}-darwin-arm64`;

// What the three services read at runtime. The web sources stay home: a
// release always serves its built web (scripts/web-mode.mjs), and the built
// server carries what it needs.
const COPY = [
  "package.json",
  "package-lock.json",
  "scripts/service.mjs",
  "scripts/setup-local.mjs",
  "scripts/web-mode.mjs",
  "shared",
  "agent",
  "router/src",
  "brand/source",
  "web/.next/standalone",
];

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

const target = path.resolve(out);
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

for (const item of COPY) {
  const from = path.join(ROOT, item);
  if (!existsSync(from)) throw new Error(`missing ${item}: build the web first (npm run build:app)`);
  cpSync(from, path.join(target, item), {
    recursive: true,
    verbatimSymlinks: true,
    // The standalone web build carries its own node_modules; nothing else may.
    filter: (src) => item === "web/.next/standalone" || !src.split(path.sep).includes("node_modules"),
  });
}

// Production dependencies only, exactly as the lockfile pins them. The router
// refuses a lockfile whose hash changed, so the copy must stay byte-identical.
const lockBefore = sha256(path.join(target, "package-lock.json"));
execFileSync("npm", ["ci", "--omit=dev", "--no-audit", "--no-fund"], {
  cwd: target,
  stdio: ["ignore", "ignore", "inherit"],
  env: {
    ...process.env,
    // This Node's own npm, so native addons are built for Node 24.
    PATH: `${path.dirname(process.execPath)}:${process.env.PATH ?? ""}`,
    npm_config_package_lock: "false",
    npm_config_save: "false",
  },
});
if (sha256(path.join(target, "package-lock.json")) !== lockBefore) throw new Error("npm ci changed package-lock.json");
// Next is only there for `next dev`, which a release never runs; the built web
// server carries its own copy. About 300 MB.
for (const dir of ["node_modules/next", "node_modules/@next"]) rmSync(path.join(target, dir), { recursive: true, force: true });
// Its bin link now points at nothing, and codesign refuses a dangling link.
// rmSync follows a link to decide, so a dangling one needs lstat and unlink.
const nextBin = path.join(target, "node_modules/.bin/next");
if (lstatSync(nextBin, { throwIfNoEntry: false })) unlinkSync(nextBin);

// An official Node, checked against nodejs.org's published checksums.
const cache = path.join(ROOT, "macos/.build/node-dist");
mkdirSync(cache, { recursive: true });
const tarball = path.join(cache, `${NODE_DIST}.tar.gz`);
const sums = path.join(cache, `SHASUMS256-${NODE_VERSION}.txt`);
if (!existsSync(sums)) execFileSync("curl", ["-fsSL", "-o", sums, `https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt`]);
if (!existsSync(tarball)) execFileSync("curl", ["-fsSL", "-o", tarball, `https://nodejs.org/dist/v${NODE_VERSION}/${NODE_DIST}.tar.gz`]);
const expected = readFileSync(sums, "utf8").split("\n").find((line) => line.endsWith(`  ${NODE_DIST}.tar.gz`))?.split(" ")[0];
if (!expected || sha256(tarball) !== expected) {
  rmSync(tarball, { force: true });
  throw new Error(`${NODE_DIST}.tar.gz does not match nodejs.org's SHASUMS256`);
}
mkdirSync(path.join(target, "bin"), { recursive: true });
execFileSync("tar", ["-xzf", tarball, "-C", path.join(target, "bin"), "--strip-components", "2", `${NODE_DIST}/bin/node`]);

writeFileSync(path.join(target, ".ub-runtime-version"), `${stamp}\n`);
process.stdout.write(`${JSON.stringify({ runtime: target, node: NODE_VERSION, stamp })}\n`);
