#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";

const [NODE_MAJOR, NODE_MINOR, NODE_PATCH] = process.versions.node.split(".").map(Number);
if (NODE_MAJOR !== 24 || NODE_MINOR < 11 || (NODE_MINOR === 11 && NODE_PATCH < 1)) {
  process.stderr.write(`setup refuses Node ${process.versions.node}, need >=24.11.1 <25\n`);
  process.exit(2);
}

process.umask(0o077);

const KEYCHAIN_ITEMS = [
  "com.usefulbot.device.desktop",
  "com.usefulbot.router.desktop",
  "com.usefulbot.router.ops",
  "com.usefulbot.channel.desktop",
];

function digest(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function putKeychain(service, token) {
  const input = Buffer.from(token, "utf8");
  const result = spawnSync("/usr/bin/security", [
    "add-generic-password",
    "-U",
    "-s",
    service,
    "-a",
    "useful-bot",
    "-w",
  ], { input, encoding: "utf8" });
  input.fill(0);
  if (result.status !== 0) {
    process.stderr.write(`${JSON.stringify({ error: "keychain_write_failed", item: service })}\n`);
    process.exit(1);
  }
}

function hasKeychain(service) {
  const result = spawnSync("/usr/bin/security", ["find-generic-password", "-s", service], {
    stdio: ["ignore", "ignore", "ignore"],
  });
  return result.status === 0;
}

const rotate = process.argv.includes("--rotate");
const root = join(homedir(), ".useful-bot");
const configPath = join(root, "config.json");

const existingItems = KEYCHAIN_ITEMS.filter(hasKeychain);
if (!rotate && (existsSync(configPath) || existingItems.length > 0)) {
  process.stderr.write(`${JSON.stringify({
    error: "already_configured",
    config: existsSync(configPath) ? configPath : null,
    keychainItems: existingItems,
    hint: "rerun with --rotate to replace existing credentials",
  })}\n`);
  process.exit(1);
}

let backup = null;
if (rotate && existsSync(configPath)) {
  backup = `${configPath}.bak.${Date.now()}`;
  renameSync(configPath, backup);
}

mkdirSync(root, { recursive: true, mode: 0o700 });
chmodSync(root, 0o700);

const desktop = randomBytes(32).toString("base64url");
const routerDesktop = randomBytes(32).toString("base64url");
const ops = randomBytes(32).toString("base64url");
const channel = randomBytes(32).toString("base64url");
const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

putKeychain("com.usefulbot.device.desktop", desktop);
putKeychain("com.usefulbot.router.desktop", routerDesktop);
putKeychain("com.usefulbot.router.ops", ops);
putKeychain("com.usefulbot.channel.desktop", channel);

const config = {
  schemaVersion: 1,
  phoneEnabled: false,
  tailnet: null,
  sandbox: { backend: "just-bash", evidenceId: "s3-non-vm-default", imageDigest: null },
  goBalanceDisabledConfirmedAt: new Date().toISOString(),
  searchKeyRequired: false,
  credentials: [
    { id: "device-desktop", kind: "device", sha256: digest(desktop), callerId: "desktop", profile: "desktop", expiresAt: future, revokedAt: null },
    { id: "router-desktop", kind: "router", sha256: digest(routerDesktop), callerId: "desktop", profile: "desktop", expiresAt: future, revokedAt: null },
    { id: "router-ops", kind: "router", sha256: digest(ops), callerId: "ops", profile: "ops", expiresAt: future, revokedAt: null },
  ],
};
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
chmodSync(configPath, 0o600);
process.stdout.write(`${JSON.stringify({
  ok: true,
  rotated: rotate,
  backup,
  config: configPath,
  keychainItems: KEYCHAIN_ITEMS,
  reveal: "Keychain Access",
  manual: "install com.usefulbot.opencode-go yourself (see README)",
})}\n`);
