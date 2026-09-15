#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";

const [NODE_MAJOR, NODE_MINOR, NODE_PATCH] = process.versions.node.split(".").map(Number);
if (NODE_MAJOR !== 24 || NODE_MINOR < 11 || (NODE_MINOR === 11 && NODE_PATCH < 1)) {
  process.stderr.write(`setup refuses Node ${process.versions.node}, need >=24.11.1 <25\n`);
  process.exit(2);
}

process.umask(0o077);

// Every app token this setup mints: a config row (digest only) and the
// Keychain item that holds the value. The channel secret has no config row,
// the web and eve services read it from Keychain to sign and verify channel
// JWTs. The reviewer credential is the only one that may carry the reviewer
// alias, so without it "ask the reviewer" reports reviewer_unconfigured.
const TOKEN_CREDENTIALS = [
  { id: "device-desktop", kind: "device", callerId: "desktop", profile: "desktop", keychain: "com.usefulbot.device.desktop" },
  { id: "router-desktop", kind: "router", callerId: "desktop", profile: "desktop", keychain: "com.usefulbot.router.desktop" },
  { id: "router-ops", kind: "router", callerId: "ops", profile: "ops", keychain: "com.usefulbot.router.ops" },
  { id: "router-reviewer", kind: "router", callerId: "reviewer", profile: "reviewer", keychain: "com.usefulbot.router.reviewer" },
];
const CHANNEL_KEYCHAIN = "com.usefulbot.channel.desktop";
const KEYCHAIN_ITEMS = [...TOKEN_CREDENTIALS.map((cred) => cred.keychain), CHANNEL_KEYCHAIN];

function digest(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

// A bare `-w` makes security prompt for the value and a retype, both read
// from stdin, and on a mismatch it stores an empty password and still exits
// 0: a token piped once ended up as an empty item. Command mode (-i) takes
// the whole command on stdin instead, so the value never reaches argv and a
// failure is a non-zero status. Tokens are base64url, so no quoting is needed.
function putKeychain(service, token) {
  const input = Buffer.from(`add-generic-password -U -s ${service} -a useful-bot -w ${token}\n`, "utf8");
  const result = spawnSync("/usr/bin/security", ["-i"], { input, stdio: ["pipe", "ignore", "ignore"] });
  input.fill(0);
  if (result.status !== 0) {
    throw new Error(service);
  }
}

// The stored value, consumed in memory and never printed; null when the item
// is absent or empty. An empty value is what the old prompt driven write left
// behind, and a service reading it gets nothing.
function readKeychain(service) {
  const result = spawnSync("/usr/bin/security", ["find-generic-password", "-s", service, "-a", "useful-bot", "-w"], {
    stdio: ["ignore", "pipe", "ignore"],
    encoding: "utf8",
  });
  const value = result.status === 0 ? result.stdout.trim() : "";
  return value.length > 0 ? value : null;
}

function hasKeychain(service) {
  return readKeychain(service) !== null;
}

// True when the Keychain value is the one the config row was minted from. A
// mismatch (an item rewritten by a put that then failed later in the batch,
// or an empty item) is as unusable as a missing one and is re-minted.
function keychainMatches(service, row) {
  const value = readKeychain(service);
  return value !== null && digest(value) === row.sha256;
}

const rotate = process.argv.includes("--rotate");
// Mints only the credentials an existing install lacks (a config row without
// its Keychain item, or neither), leaving every other token as it is. This is
// how an install from before the reviewer credential picks it up without a
// full --rotate, which would also invalidate the device and desktop tokens.
const addMissing = process.argv.includes("--add-missing");
const root = join(homedir(), ".useful-bot");
const configPath = join(root, "config.json");

if (rotate && addMissing) {
  process.stderr.write(`${JSON.stringify({ error: "conflicting_flags", flags: ["--rotate", "--add-missing"] })}\n`);
  process.exit(2);
}

const existingItems = KEYCHAIN_ITEMS.filter(hasKeychain);
if (!rotate && !addMissing && (existsSync(configPath) || existingItems.length > 0)) {
  process.stderr.write(`${JSON.stringify({
    error: "already_configured",
    config: existsSync(configPath) ? configPath : null,
    keychainItems: existingItems,
    hint: "rerun with --add-missing to mint only what is absent, or --rotate to replace every credential",
  })}\n`);
  process.exit(1);
}

function readExistingConfig() {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (err) {
    const reason = err instanceof Error && err.code === "ENOENT" ? "not_configured" : "config_unreadable";
    // Fresh setup refuses while any Keychain item exists, so a lost config
    // with items left behind can only be rebuilt by --rotate.
    const hint = existingItems.length > 0 ? "rerun with --rotate to rebuild the config" : "run setup without flags first";
    process.stderr.write(`${JSON.stringify({ error: reason, config: configPath, hint })}\n`);
    process.exit(1);
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.credentials)) {
    process.stderr.write(`${JSON.stringify({ error: "config_invalid", config: configPath })}\n`);
    process.exit(1);
  }
  return parsed;
}

// The old config stays in place until the new secrets are stored: a failed
// put must leave the previous config untouched.
mkdirSync(root, { recursive: true, mode: 0o700 });
chmodSync(root, 0o700);

const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

function mint(cred) {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    keychain: cred.keychain,
    row: { id: cred.id, kind: cred.kind, sha256: digest(token), callerId: cred.callerId, profile: cred.profile, expiresAt: future, revokedAt: null },
  };
}

let config;
let minted;
if (addMissing) {
  config = readExistingConfig();
  // A revoked row is a decision, not a gap: it stays as it is and is never
  // re-minted here (that is what --rotate is for). Only an id with no row at
  // all, an active row whose Keychain value no longer matches its digest, or
  // an active row past its expiry counts as missing.
  const rows = config.credentials.filter((row) => row && typeof row.id === "string");
  const known = new Set(rows.map((row) => row.id));
  const active = new Map(rows.filter((row) => row.revokedAt === null).map((row) => [row.id, row]));
  minted = TOKEN_CREDENTIALS
    .filter((cred) => {
      if (!known.has(cred.id)) return true;
      const row = active.get(cred.id);
      if (row === undefined) return false;
      if (!keychainMatches(cred.keychain, row)) return true;
      // Credentials expire 30 days after setup; an expired-but-matching row
      // is refreshed here so the install does not need a full --rotate.
      const expires = Date.parse(row.expiresAt);
      return Number.isNaN(expires) || expires <= Date.now();
    })
    .map(mint);
  if (!hasKeychain(CHANNEL_KEYCHAIN)) {
    minted.push({ token: randomBytes(32).toString("base64url"), keychain: CHANNEL_KEYCHAIN, row: null });
  }
  if (minted.length === 0) {
    process.stdout.write(`${JSON.stringify({ ok: true, added: [], config: configPath })}\n`);
    process.exit(0);
  }
  const replaced = new Set(minted.filter((entry) => entry.row).map((entry) => entry.row.id));
  config.credentials = [
    ...config.credentials.filter((row) => !(row && row.revokedAt === null && replaced.has(row.id))),
    ...minted.filter((entry) => entry.row).map((entry) => entry.row),
  ];
} else {
  minted = [
    ...TOKEN_CREDENTIALS.map(mint),
    { token: randomBytes(32).toString("base64url"), keychain: CHANNEL_KEYCHAIN, row: null },
  ];
  config = {
    schemaVersion: 1,
    phoneEnabled: false,
    tailnet: null,
    sandbox: { backend: "just-bash", evidenceId: "s3-non-vm-default", imageDigest: null },
    goBalanceDisabledConfirmedAt: new Date().toISOString(),
    searchKeyRequired: false,
    credentials: minted.filter((entry) => entry.row).map((entry) => entry.row),
  };
}
const tmpConfigPath = `${configPath}.tmp.${process.pid}`;
writeFileSync(tmpConfigPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
chmodSync(tmpConfigPath, 0o600);

try {
  for (const entry of minted) {
    putKeychain(entry.keychain, entry.token);
  }
} catch (err) {
  try { unlinkSync(tmpConfigPath); } catch { /* ignore */ }
  const item = err instanceof Error ? err.message : "unknown";
  process.stderr.write(`${JSON.stringify({ error: "keychain_write_failed", item })}\n`);
  process.exit(1);
}

let backup = null;
if ((rotate || addMissing) && existsSync(configPath)) {
  backup = `${configPath}.bak.${Date.now()}`;
  renameSync(configPath, backup);
}
renameSync(tmpConfigPath, configPath);
chmodSync(configPath, 0o600);
process.stdout.write(`${JSON.stringify({
  ok: true,
  rotated: rotate,
  added: addMissing ? minted.map((entry) => entry.keychain) : undefined,
  backup,
  config: configPath,
  keychainItems: KEYCHAIN_ITEMS,
  reveal: "Keychain Access",
  manual: "install com.usefulbot.opencode-go yourself (see README)",
  restart: "restart the router, eve and web services: the router reloads the credential table and the other two read the tokens at boot",
})}\n`);
