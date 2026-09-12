#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";

const NODE_MAJOR = Number(process.versions.node.split(".")[0]);
if (NODE_MAJOR !== 24) {
  process.stderr.write("setup refuses Node other than 24\n");
  process.exit(2);
}

function digest(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function putKeychain(service, token) {
  const result = spawnSync("/usr/bin/security", [
    "add-generic-password",
    "-U",
    "-s",
    service,
    "-a",
    "useful-bot",
    "-w",
    token,
  ], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(`${JSON.stringify({ error: "keychain_write_failed", item: service })}\n`);
    process.exit(1);
  }
}

const root = join(homedir(), ".useful-bot");
mkdirSync(root, { recursive: true, mode: 0o700 });
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
writeFileSync(join(root, "config.json"), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify({
  ok: true,
  config: join(root, "config.json"),
  keychainItems: [
    "com.usefulbot.device.desktop",
    "com.usefulbot.router.desktop",
    "com.usefulbot.router.ops",
    "com.usefulbot.channel.desktop",
  ],
  reveal: "Keychain Access",
})}\n`);
