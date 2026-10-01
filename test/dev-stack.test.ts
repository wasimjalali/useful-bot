import assert from "node:assert/strict";
import test from "node:test";
import { execFile, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { agentStorePath } from "../shared/agent-store.ts";
import { defaultShellPath } from "../shared/shell-io.ts";
import { defaultApprovalsPath } from "../agent/lib/approvals.ts";
import { defaultWorkspacePath } from "../shared/workspace-store.ts";
import { routinesStorePath } from "../shared/routines-store.ts";
import { defaultWebSessionsPath } from "../shared/web-sessions.ts";
import { handoffDir } from "../shared/handoffs.ts";
import { memoryRoot } from "../agent/lib/memory.ts";
import { widgetsDir } from "../shared/widgets-store.ts";
import { imagesDir } from "../shared/images-store.ts";
import { mediaIndexPath, mediaRoot } from "../shared/media-store.ts";
import { providersPath } from "../shared/providers.ts";
import { modelsCachePath } from "../shared/live-models.ts";
import { connectorsPath } from "../shared/connectors-store.ts";
import { connectionsPath } from "../shared/connections-store.ts";
import { connectionToolsPath } from "../shared/connection-tools-store.ts";
import { oauthPendingPath } from "../shared/mcp-oauth.ts";
import { providerPendingPath } from "../shared/provider-oauth.ts";
import { cataloguePath } from "../shared/composio-catalogue.ts";
import { limitsPath } from "../shared/limits-store.ts";
import { defaultOwnerPath } from "../agent/lib/session-owners.ts";
import { connectionSecretService, keychainGet, keychainSet, memoryKeychain, setKeychainDriver } from "../shared/keychain.ts";
import { isForbiddenChildSegment, isGrantableRootPath } from "../shared/shell-store.ts";
import { resolveWorkspacePath } from "../agent/lib/workspace.ts";
import { confinedCommand, sandboxAvailable, sandboxProfile } from "../agent/lib/sandbox.ts";
import bash from "../agent/tools/bash.ts";
import {
  assertStack,
  eveOrigin,
  evePort,
  keychainName,
  keychainPrefix,
  routerApiBase,
  routerConfigPath,
  routerDbPath,
  routerOrigin,
  routerPort,
  stackName,
  stackProblems,
  stateRoot,
  webOrigin,
  webPort,
} from "../shared/stack.ts";

const ROOT = dirname(fileURLToPath(new URL(".", import.meta.url)));
const execFileAsync = promisify(execFile);
const darwin = process.platform === "darwin";

// Every variable the stack and the stores read. withEnv clears all of them,
// so a developer's own shell (or a UB_* left by another test) cannot leak in.
const STORE_OVERRIDES = [
  "UB_AGENT_STORE_PATH", "UB_SHELL_PATH", "UB_APPROVALS_PATH", "UB_WORKSPACE_STORE_PATH", "UB_ROUTINES_PATH",
  "UB_WEB_SESSIONS_PATH", "UB_HANDOFF_DIR", "UB_MEMORY_ROOT", "UB_WIDGETS_DIR", "UB_IMAGES_DIR",
  "UB_MEDIA_INDEX_PATH", "UB_PROVIDERS_PATH", "UB_MODELS_CACHE_PATH", "UB_CONNECTORS_PATH", "UB_CONNECTIONS_PATH",
  "UB_CONNECTION_TOOLS_PATH", "UB_OAUTH_PENDING_PATH", "UB_PROVIDER_OAUTH_PATH", "UB_CATALOGUE_PATH", "UB_LIMITS_PATH",
  "UB_ROUTER_DB", "UB_ROUTER_CONFIG",
];
const STACK_VARS = [
  "UB_STACK", "UB_STATE_ROOT", "UB_ROUTER_PORT", "UB_WEB_PORT", "UB_EVE_PORT", "UB_KEYCHAIN_PREFIX", "UB_MEDIA_DIR",
  "UB_WEB_BASE_URL", "UB_ROUTER_BASE_URL",
];
const ALL_VARS = ["HOME", "NODE_TEST_CONTEXT", ...STACK_VARS, ...STORE_OVERRIDES];

function withEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const saved = new Map(ALL_VARS.map((key) => [key, process.env[key]] as const));
  for (const key of ALL_VARS) delete process.env[key];
  for (const [key, value] of Object.entries(env)) if (value !== undefined) process.env[key] = value;
  try {
    return fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const tempHome = () => mkdtempSync(join(tmpdir(), "ub-stack-"));

function devEnv(home: string): Record<string, string> {
  return {
    HOME: home,
    UB_STACK: "dev",
    UB_STATE_ROOT: join(home, ".useful-bot-dev-app"),
    UB_ROUTER_PORT: "4419",
    UB_WEB_PORT: "4420",
    UB_EVE_PORT: "4421",
    UB_KEYCHAIN_PREFIX: "com.usefulbot.dev",
    UB_MEDIA_DIR: join(home, "Documents", "Useful Bot Dev"),
    UB_WEB_BASE_URL: "http://127.0.0.1:4420",
  };
}

// ---------------------------------------------------------------------------
// 1. Every store resolves under the state root, and its own override still wins.

const STORES: Array<{ name: string; path: () => string; tail: string; override: string | null }> = [
  { name: "agent-store", path: () => agentStorePath(), tail: "agents.json", override: "UB_AGENT_STORE_PATH" },
  { name: "shell-io", path: () => defaultShellPath(), tail: "shell.json", override: "UB_SHELL_PATH" },
  { name: "approvals", path: () => defaultApprovalsPath(), tail: "approvals.json", override: "UB_APPROVALS_PATH" },
  { name: "workspace-store", path: () => defaultWorkspacePath(), tail: "workspace.json", override: "UB_WORKSPACE_STORE_PATH" },
  { name: "routines-store", path: () => routinesStorePath(), tail: "routines.json", override: "UB_ROUTINES_PATH" },
  { name: "web-sessions", path: () => defaultWebSessionsPath(), tail: "web-sessions.json", override: "UB_WEB_SESSIONS_PATH" },
  { name: "handoffs", path: () => handoffDir(), tail: "handoffs", override: "UB_HANDOFF_DIR" },
  { name: "memory", path: () => memoryRoot(), tail: "memory", override: "UB_MEMORY_ROOT" },
  { name: "widgets-store", path: () => widgetsDir(), tail: "widgets", override: "UB_WIDGETS_DIR" },
  { name: "images-store", path: () => imagesDir(), tail: "images", override: "UB_IMAGES_DIR" },
  { name: "media-store index", path: () => mediaIndexPath(), tail: "media.json", override: "UB_MEDIA_INDEX_PATH" },
  { name: "providers", path: () => providersPath(), tail: "providers.json", override: "UB_PROVIDERS_PATH" },
  { name: "live-models", path: () => modelsCachePath(), tail: "models-cache.json", override: "UB_MODELS_CACHE_PATH" },
  { name: "connectors-store", path: () => connectorsPath(), tail: "connectors.json", override: "UB_CONNECTORS_PATH" },
  { name: "connections-store", path: () => connectionsPath(), tail: "connections.json", override: "UB_CONNECTIONS_PATH" },
  { name: "connection-tools-store", path: () => connectionToolsPath(), tail: "connection-tools.json", override: "UB_CONNECTION_TOOLS_PATH" },
  { name: "mcp-oauth", path: () => oauthPendingPath(), tail: "connections-oauth.json", override: "UB_OAUTH_PENDING_PATH" },
  { name: "provider-oauth", path: () => providerPendingPath(), tail: "provider-oauth.json", override: "UB_PROVIDER_OAUTH_PATH" },
  { name: "composio-catalogue", path: () => cataloguePath(), tail: "composio-catalogue.json", override: "UB_CATALOGUE_PATH" },
  { name: "limits-store", path: () => limitsPath(), tail: "limits.json", override: "UB_LIMITS_PATH" },
  { name: "router usage db", path: () => routerDbPath(), tail: "router/usage.sqlite", override: "UB_ROUTER_DB" },
  { name: "router config", path: () => routerConfigPath(), tail: "config.json", override: "UB_ROUTER_CONFIG" },
  { name: "session owners", path: () => defaultOwnerPath(), tail: "policy.sqlite", override: null },
];

test("with no stack setting every store sits under ~/.useful-bot (daily unchanged)", () => {
  const home = tempHome();
  try {
    withEnv({ HOME: home }, () => {
      for (const store of STORES) {
        assert.equal(store.path(), join(home, ".useful-bot", store.tail), store.name);
      }
      assert.equal(stateRoot(), join(home, ".useful-bot"));
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("with UB_STATE_ROOT every store sits under it, not under ~/.useful-bot", () => {
  const home = tempHome();
  const root = join(home, "elsewhere");
  try {
    withEnv({ HOME: home, UB_STATE_ROOT: root }, () => {
      for (const store of STORES) {
        assert.equal(store.path(), join(root, store.tail), store.name);
      }
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("a store's own UB_*_PATH override beats UB_STATE_ROOT and the default", () => {
  const home = tempHome();
  try {
    for (const store of STORES) {
      if (!store.override) continue;
      const pinned = join(home, "pinned", store.tail);
      withEnv({ HOME: home, UB_STATE_ROOT: join(home, "elsewhere"), [store.override]: pinned }, () => {
        assert.equal(store.path(), pinned, `${store.name} with UB_STATE_ROOT`);
      });
      withEnv({ HOME: home, [store.override]: pinned }, () => {
        assert.equal(store.path(), pinned, `${store.name} without UB_STATE_ROOT`);
      });
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("the media folder keeps ~/Documents/Useful Bot by default and honours UB_MEDIA_DIR", () => {
  const home = tempHome();
  try {
    withEnv({ HOME: home }, () => {
      assert.equal(mediaRoot(), join(home, "Documents", "Useful Bot"));
    });
    withEnv({ HOME: home, UB_MEDIA_DIR: join(home, "Documents", "Useful Bot Dev") }, () => {
      assert.equal(mediaRoot(), join(home, "Documents", "Useful Bot Dev"));
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 2. Ports, prefix and origins default to today's values.

test("ports, prefix and origins default to the daily literals", () => {
  const home = tempHome();
  try {
    withEnv({ HOME: home }, () => {
      assert.equal(stackName(), "daily");
      assert.equal(routerPort(), 4319);
      assert.equal(webPort(), 4320);
      assert.equal(evePort(), 4321);
      assert.equal(keychainPrefix(), "com.usefulbot");
      assert.equal(keychainName("router.desktop"), "com.usefulbot.router.desktop");
      assert.equal(routerOrigin(), "http://127.0.0.1:4319");
      assert.equal(routerApiBase(), "http://127.0.0.1:4319/v1");
      assert.equal(eveOrigin(), "http://127.0.0.1:4321");
      assert.equal(webOrigin(), "http://127.0.0.1:4320");
      assert.deepEqual(stackProblems(), []);
    });
    withEnv({ HOME: home, UB_STACK: "daily" }, () => assert.equal(stackName(), "daily"));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("a port or base URL given in the environment is used; a bad port is refused", () => {
  withEnv({ UB_ROUTER_PORT: "5319", UB_WEB_PORT: "5320", UB_EVE_PORT: "5321" }, () => {
    assert.equal(routerPort(), 5319);
    assert.equal(webPort(), 5320);
    assert.equal(evePort(), 5321);
    assert.equal(routerApiBase(), "http://127.0.0.1:5319/v1");
    assert.equal(webOrigin(), "http://127.0.0.1:5320");
  });
  withEnv({ UB_ROUTER_BASE_URL: "http://127.0.0.1:9/v1" }, () => assert.equal(routerApiBase(), "http://127.0.0.1:9/v1"));
  withEnv({ UB_WEB_BASE_URL: "https://x.example" }, () => assert.equal(webOrigin(), "https://x.example"));
  for (const bad of ["abc", "0", "70000", "43.5", "-1"]) {
    withEnv({ UB_WEB_PORT: bad }, () => assert.throws(() => webPort(), /UB_WEB_PORT/, bad));
  }
  withEnv({ UB_STACK: "staging" }, () => assert.throws(() => stackName(), /UB_STACK/));
});

// ---------------------------------------------------------------------------
// 3. The dev stack fails loud and never falls back to a daily value.

test("a complete dev environment passes and resolves every value to its dev one", () => {
  const home = tempHome();
  try {
    withEnv(devEnv(home), () => {
      assert.deepEqual(stackProblems(), []);
      assert.doesNotThrow(() => assertStack());
      assert.equal(stackName(), "dev");
      assert.equal(stateRoot(), join(home, ".useful-bot-dev-app"));
      assert.equal(routerPort(), 4419);
      assert.equal(webPort(), 4420);
      assert.equal(evePort(), 4421);
      assert.equal(routerOrigin(), "http://127.0.0.1:4419");
      assert.equal(eveOrigin(), "http://127.0.0.1:4421");
      assert.equal(webOrigin(), "http://127.0.0.1:4420");
      assert.equal(keychainPrefix(), "com.usefulbot.dev");
      assert.equal(keychainName("device.desktop"), "com.usefulbot.dev.device.desktop");
      assert.equal(routerDbPath(), join(home, ".useful-bot-dev-app", "router", "usage.sqlite"));
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("dev with any required value missing throws and names it", () => {
  const home = tempHome();
  try {
    for (const missing of ["UB_STATE_ROOT", "UB_ROUTER_PORT", "UB_WEB_PORT", "UB_EVE_PORT", "UB_KEYCHAIN_PREFIX", "UB_MEDIA_DIR"]) {
      const env: Record<string, string | undefined> = { ...devEnv(home), [missing]: undefined };
      withEnv(env, () => {
        assert.throws(() => assertStack(), new RegExp(missing), `${missing} missing`);
        assert.ok(stackProblems().some((problem) => problem.includes(missing)), missing);
      });
    }
    // Empty is missing too.
    withEnv({ ...devEnv(home), UB_KEYCHAIN_PREFIX: "" }, () => assert.throws(() => assertStack(), /UB_KEYCHAIN_PREFIX/));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("dev with a daily-equal value throws, however the path is spelled", () => {
  const home = tempHome();
  try {
    const cases: Array<[string, string]> = [
      ["UB_STATE_ROOT", join(home, ".useful-bot")],
      ["UB_STATE_ROOT", `${join(home, ".useful-bot")}/`],
      ["UB_STATE_ROOT", join(home, "x", "..", ".useful-bot")],
      // The owner's older dev data: never adopted either.
      ["UB_STATE_ROOT", join(home, ".useful-bot-dev")],
      ["UB_ROUTER_PORT", "4319"],
      ["UB_WEB_PORT", "4320"],
      ["UB_EVE_PORT", "4321"],
      ["UB_KEYCHAIN_PREFIX", "com.usefulbot"],
      ["UB_MEDIA_DIR", join(home, "Documents", "Useful Bot")],
    ];
    for (const [name, value] of cases) {
      withEnv({ ...devEnv(home), [name]: value }, () => {
        assert.throws(() => assertStack(), new RegExp(name), `${name}=${value}`);
      });
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("a dev service entry exits non-zero before it starts anything", () => {
  const home = tempHome();
  try {
    const bare = { ...process.env, HOME: home, UB_STACK: "dev" } as Record<string, string>;
    for (const key of ALL_VARS) if (key !== "HOME" && key !== "UB_STACK") delete bare[key];
    for (const mode of ["router", "eve", "web"]) {
      const result = spawnSync(process.execPath, [join(ROOT, "scripts/service.mjs"), mode], {
        env: bare, encoding: "utf8", timeout: 20_000,
      });
      assert.notEqual(result.status, 0, `${mode} must not start on a bare dev env`);
      assert.match(result.stderr, /UB_STATE_ROOT/, mode);
      assert.match(result.stderr, /UB_KEYCHAIN_PREFIX/, mode);
    }
    // A complete dev env gets past the check: an unknown mode then prints usage (exit 2).
    const ok = spawnSync(process.execPath, [join(ROOT, "scripts/service.mjs"), "nonsense"], {
      env: { ...bare, ...devEnv(home) }, encoding: "utf8", timeout: 20_000,
    });
    assert.equal(ok.status, 2);
    assert.match(ok.stderr, /usage: service\.mjs/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 4. Keychain names follow the prefix.

test("keychain service names follow the daily prefix and refuse junk", () => {
  const home = tempHome();
  try {
    withEnv({ HOME: home }, () => {
      const kc = memoryKeychain();
      setKeychainDriver(kc);
      try {
        assert.equal(connectionSecretService("abc"), "com.usefulbot.connection.abc");
        keychainSet("com.usefulbot.connection.abc", "v");
        assert.equal(keychainGet("com.usefulbot.connection.abc"), "v");
        for (const junk of [
          "com.usefulbot.", "com.usefulbot", "com.usefulbotx.y", "evil.com.usefulbot.x", "com.usefulbot.UPPER",
          "com.usefulbot.a b", "com.usefulbot.a;b", "org.other.thing", "",
          // The dev stack's items are not the daily stack's to read or write.
          "com.usefulbot.dev.connection.abc", "com.usefulbot.dev.device.desktop",
        ]) {
          assert.throws(() => keychainSet(junk, "v"), /keychain_service/, junk);
          assert.throws(() => keychainGet(junk), /keychain_service/, junk);
        }
        assert.throws(() => connectionSecretService("Bad Id"), /keychain_service/);
      } finally {
        setKeychainDriver(null);
      }
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("keychain service names follow the dev prefix and refuse daily names", () => {
  const home = tempHome();
  try {
    withEnv(devEnv(home), () => {
      const kc = memoryKeychain();
      setKeychainDriver(kc);
      try {
        assert.equal(connectionSecretService("abc"), "com.usefulbot.dev.connection.abc");
        keychainSet("com.usefulbot.dev.connection.abc", "v");
        assert.equal(keychainGet("com.usefulbot.dev.connection.abc"), "v");
        assert.deepEqual([...kc.store.keys()], ["com.usefulbot.dev.connection.abc"]);
        for (const junk of [
          "com.usefulbot.connection.abc", "com.usefulbot.device.desktop", "com.usefulbot.dev", "com.usefulbot.dev.",
          "com.usefulbot.dev.UPPER", "com.usefulbot.devx.abc", "evil.com.usefulbot.dev.x",
        ]) {
          assert.throws(() => keychainSet(junk, "v"), /keychain_service/, junk);
          assert.throws(() => keychainGet(junk), /keychain_service/, junk);
        }
      } finally {
        setKeychainDriver(null);
      }
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("a malformed UB_KEYCHAIN_PREFIX is refused", () => {
  for (const bad of ["evil", "com.usefulbot.dev;rm -rf", "COM.usefulbot", "com..usefulbot", "com.usefulbot."]) {
    withEnv({ UB_KEYCHAIN_PREFIX: bad }, () => assert.throws(() => keychainPrefix(), /UB_KEYCHAIN_PREFIX/, bad));
  }
});

// ---------------------------------------------------------------------------
// 5. setup-local (end to end, against the Keychain stub) honours the stack.

const HOOKS = join(ROOT, "test/fixtures/security-stub/hooks.mjs");
const STUB_SH = join(ROOT, "test/fixtures/security-stub/security.sh");

function setupBox() {
  const base = mkdtempSync(join(tmpdir(), "ub-stack-setup-"));
  const home = join(base, "home");
  const keychain = join(base, "keychain");
  mkdirSync(home);
  mkdirSync(keychain);
  const run = (env: Record<string, string>, ...args: string[]) => {
    const clean = { ...process.env } as Record<string, string>;
    for (const key of ALL_VARS) delete clean[key];
    const result = spawnSync(process.execPath, ["--import", HOOKS, join(ROOT, "scripts/setup-local.mjs"), ...args], {
      env: { ...clean, HOME: home, STUB_SECURITY_BIN: STUB_SH, STUB_KEYCHAIN_DIR: keychain, ...env },
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  };
  return { base, home, keychain, run };
}

test("setup-local on the dev stack writes under UB_STATE_ROOT and the dev Keychain prefix only", () => {
  const box = setupBox();
  try {
    const env = devEnv(box.home);
    const result = box.run(env);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(env.UB_STATE_ROOT, "config.json")), "config under the dev state root");
    assert.equal(existsSync(join(box.home, ".useful-bot")), false, "daily state root untouched");
    const items = readdirSync(box.keychain);
    assert.ok(items.length >= 5, `expected the five items, saw ${items.join(",")}`);
    for (const item of items) assert.ok(item.startsWith("com.usefulbot.dev."), `daily-prefixed item written: ${item}`);
    for (const name of ["device.desktop", "router.desktop", "router.ops", "router.reviewer", "channel.desktop"]) {
      assert.ok(items.includes(`com.usefulbot.dev.${name}`), name);
    }
    const printed = JSON.parse(result.stdout.trim().split("\n").at(-1) ?? "{}");
    assert.ok(Array.isArray(printed.keychainItems) && printed.keychainItems.every((item: string) => item.startsWith("com.usefulbot.dev.")));
    assert.equal(printed.config, join(env.UB_STATE_ROOT, "config.json"));
  } finally {
    rmSync(box.base, { recursive: true, force: true });
  }
});

test("setup-local on a bare dev environment refuses and writes nothing", () => {
  const box = setupBox();
  try {
    const result = box.run({ UB_STACK: "dev" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /UB_STATE_ROOT/);
    assert.match(result.stderr, /UB_KEYCHAIN_PREFIX/);
    assert.deepEqual(readdirSync(box.keychain), []);
    assert.equal(existsSync(join(box.home, ".useful-bot")), false);
  } finally {
    rmSync(box.base, { recursive: true, force: true });
  }
});

test("setup-local with only UB_STATE_ROOT set still honours it; with nothing set it is the daily layout", () => {
  const box = setupBox();
  try {
    const root = join(box.base, "custom-root");
    const result = box.run({ UB_STATE_ROOT: root });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(root, "config.json")));
    assert.equal(existsSync(join(box.home, ".useful-bot")), false);
    for (const item of readdirSync(box.keychain)) assert.ok(item.startsWith("com.usefulbot."), item);
    assert.ok(readdirSync(box.keychain).includes("com.usefulbot.device.desktop"));
  } finally {
    rmSync(box.base, { recursive: true, force: true });
  }
  const daily = setupBox();
  try {
    const result = daily.run({});
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(daily.home, ".useful-bot", "config.json")));
    assert.ok(readdirSync(daily.keychain).includes("com.usefulbot.device.desktop"));
  } finally {
    rmSync(daily.base, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 6. The router reports its stack and accepts only its own configured port.

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });

function rawGet(port: number, path: string, hostHeader: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port, path, method: "GET", headers: { host: hostHeader } }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.once("error", reject);
    req.end();
  });
}

async function withRouter<T>(env: Record<string, string>, port: number, fn: () => Promise<T>): Promise<T> {
  const base = mkdtempSync(join(tmpdir(), "ub-stack-router-"));
  const clean = { ...process.env } as Record<string, string>;
  for (const key of ALL_VARS) delete clean[key];
  const future = new Date(Date.now() + 86400_000).toISOString();
  writeFileSync(join(base, "config.json"), JSON.stringify({
    schemaVersion: 1,
    phoneEnabled: false,
    tailnet: null,
    sandbox: { backend: "just-bash", evidenceId: "s3-non-vm-default", imageDigest: null },
    goBalanceDisabledConfirmedAt: null,
    searchKeyRequired: false,
    credentials: [
      { id: "d", kind: "router", sha256: createHash("sha256").update("stack-token").digest("hex"), callerId: "desktop", profile: "desktop", expiresAt: future, revokedAt: null },
    ],
  }));
  const child = spawn(process.execPath, ["--experimental-strip-types", "router/src/index.ts"], {
    cwd: ROOT,
    env: {
      ...clean,
      HOME: base,
      UB_ROUTER_CONFIG: join(base, "config.json"),
      UB_ROUTER_DB: join(base, "usage.sqlite"),
      ...env,
      UB_ROUTER_PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  try {
    const deadline = Date.now() + 10_000;
    for (;;) {
      try {
        await rawGet(port, "/health/live", `127.0.0.1:${port}`);
        break;
      } catch {
        if (Date.now() > deadline) throw new Error(`router did not start: ${output}`);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    return await fn();
  } finally {
    child.kill("SIGKILL");
    rmSync(base, { recursive: true, force: true });
  }
}

test("router /health/live says daily by default and dev when it is the dev stack", async () => {
  const dailyPort = await freePort();
  await withRouter({}, dailyPort, async () => {
    const live = await rawGet(dailyPort, "/health/live", `127.0.0.1:${dailyPort}`);
    assert.equal(live.status, 200);
    assert.equal(JSON.parse(live.body).stack, "daily");
  });
  const devPort = await freePort();
  const home = tempHome();
  try {
    await withRouter({ ...devEnv(home), UB_ROUTER_DB: join(home, "usage.sqlite") }, devPort, async () => {
      const live = await rawGet(devPort, "/health/live", `127.0.0.1:${devPort}`);
      assert.equal(live.status, 200);
      assert.deepEqual(JSON.parse(live.body), { ok: true, stack: "dev" });
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("the router host check accepts its own configured port and refuses the daily one", async () => {
  const port = await freePort();
  assert.notEqual(port, 4319);
  await withRouter({}, port, async () => {
    const own = await rawGet(port, "/v1/models", `127.0.0.1:${port}`);
    // Past the host check it reaches authentication, which refuses with 401.
    assert.equal(own.status, 401, own.body);
    const daily = await rawGet(port, "/v1/models", "127.0.0.1:4319");
    assert.equal(daily.status, 403, daily.body);
    assert.match(daily.body, /origin_forbidden/);
  });
});

test("the router refuses to start as dev without a complete dev environment", () => {
  const clean = { ...process.env } as Record<string, string>;
  for (const key of ALL_VARS) delete clean[key];
  const base = tempHome();
  try {
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "router/src/index.ts"], {
      cwd: ROOT,
      env: { ...clean, HOME: base, UB_STACK: "dev", UB_ROUTER_CONFIG: join(base, "c.json") },
      encoding: "utf8",
      timeout: 15_000,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /UB_STATE_ROOT/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("the web status, health and root routes report the stack", () => {
  // The routes sit behind Next's request context (cookies), so they cannot be
  // called from node:test. Their source is held to the one helper instead; the
  // helper itself is covered above.
  for (const file of ["web/app/api/status/route.ts", "web/app/api/health/route.ts", "web/app/route.ts"]) {
    const source = readFileSync(join(ROOT, file), "utf8");
    assert.match(source, /stack:\s*stackName\(\)/, file);
  }
});

// ---------------------------------------------------------------------------
// 7. Deny-lists block every app-state folder and nothing unrelated.

const BLOCKED_DIRS = [".useful-bot", ".useful-bot-dev", ".useful-bot-dev-app"];
const FREE_DIRS = [".useful-botany", "useful-bot", "useful-bot-dev", ".useful-bots"];

test("a grant on an app-state folder or anything inside one is refused; project folders are fine", () => {
  for (const dir of BLOCKED_DIRS) {
    assert.equal(isGrantableRootPath(`/Users/me/${dir}`), false, dir);
    assert.equal(isGrantableRootPath(`/Users/me/${dir}/router`), false, dir);
    assert.equal(isGrantableRootPath(`/Users/me/${dir.toUpperCase()}`), false, `${dir} upper`);
  }
  for (const dir of FREE_DIRS) assert.equal(isGrantableRootPath(`/Users/me/Desktop/${dir}`), true, dir);
  assert.equal(isGrantableRootPath("/Users/me/Desktop/useful-bot"), true);
});

test("the child-segment screen refuses every app-state name and keeps its other rules", () => {
  for (const dir of BLOCKED_DIRS) assert.equal(isForbiddenChildSegment(dir), true, dir);
  for (const dir of FREE_DIRS) assert.equal(isForbiddenChildSegment(dir), false, dir);
  // Unchanged neighbours: `.docker` is a store, `.dockerignore` is not.
  assert.equal(isForbiddenChildSegment(".docker"), true);
  assert.equal(isForbiddenChildSegment(".dockerignore"), false);
});

test("a path under a grant that touches an app-state folder is refused", () => {
  const root = mkdtempSync(join(tmpdir(), "ub-stack-ws-"));
  try {
    for (const dir of BLOCKED_DIRS) {
      assert.throws(() => resolveWorkspacePath(`${dir}/config.json`, root), /path_forbidden/, dir);
      assert.throws(() => resolveWorkspacePath(`sub/${dir}`, root), /path_forbidden/, `sub/${dir}`);
    }
    for (const dir of FREE_DIRS) assert.doesNotThrow(() => resolveWorkspacePath(`${dir}/notes.md`, root), dir);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the shell tripwire blocks a line naming an app-state folder and lets project names through", async () => {
  type Tool = { execute: (input: never, context: never) => unknown };
  const run = async (command: string) => (await (bash as unknown as Tool).execute({ command } as never, {} as never)) as { status?: string };
  for (const dir of BLOCKED_DIRS) {
    assert.equal((await run(`cat ~/${dir}/config.json`)).status, "blocked", dir);
    assert.equal((await run(`ls "$HOME/${dir}"`)).status, "blocked", `${dir} quoted`);
  }
  for (const dir of FREE_DIRS) {
    assert.notEqual((await run(`echo ~/Desktop/${dir}`)).status, "blocked", dir);
  }
});

test("the sandbox profile denies reads and writes of every app-state folder", () => {
  const root = mkdtempSync(join(tmpdir(), "ub-stack-sb-"));
  try {
    for (const profile of [sandboxProfile(root), sandboxProfile(root, "folder"), sandboxProfile(root, "computer", true), sandboxProfile(null)]) {
      // The pattern for the dashed names (.useful-bot-dev, .useful-bot-dev-app).
      assert.ok(profile.includes('(deny file-write* (regex #"/\\.useful-bot-[^/]*($|/)"))'), "write deny for dashed names");
      assert.ok(profile.includes('(deny file-read* (regex #"/\\.useful-bot-[^/]*($|/)"))'), "read deny for dashed names");
      // And the original rule is still there.
      assert.ok(profile.includes('(deny file-write* (regex #"/\\.useful-bot($|[/.])"))'));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the kernel refuses a write into every app-state folder and allows unrelated names", { skip: !darwin || !sandboxAvailable() }, async () => {
  const root = mkdtempSync(join(tmpdir(), "ub-stack-k-"));
  const confined = async (command: string) => {
    const args = confinedCommand(root, command);
    try {
      await execFileAsync(args[0], args.slice(1), { cwd: root, env: { PATH: "/usr/bin:/bin", HOME: root, TMPDIR: root } });
      return true;
    } catch {
      return false;
    }
  };
  try {
    for (const dir of BLOCKED_DIRS) {
      assert.equal(await confined(`mkdir ${dir}`), false, dir);
      assert.equal(existsSync(join(root, dir)), false, `${dir} was created`);
    }
    for (const dir of FREE_DIRS) {
      assert.equal(await confined(`mkdir ${dir}`), true, dir);
      assert.ok(statSync(join(root, dir)).isDirectory(), dir);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 8. Guard: runtime code reads ports, the Keychain prefix and the state root
//    from the one config module, nowhere else.

// Files that legitimately name a daily literal, and why.
const ALLOW = new Set([
  "shared/stack.ts", // the one place
  // launchd service labels and a --state-root default for the LaunchAgent plists,
  // not Keychain items; the daily plists are a separate install path.
  "shared/launchd-render.ts",
  "scripts/render-launchd.mjs",
  // A staged fake HOME for the runtime smoke test, which pins every path itself.
  "scripts/smoke-runtime.mjs",
]);
const SCAN_DIRS = ["agent", "shared", "router/src", "web/app", "web/lib", "scripts"];
const EXTS = /\.(ts|tsx|mjs|js)$/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name.startsWith(".")) continue;
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) sourceFiles(rel, out);
    else if (EXTS.test(entry.name)) out.push(rel);
  }
  return out;
}

/** Comment text is prose, not code: drop whole-line comments and ` // ` tails. */
function codeLines(text: string): Array<[number, string]> {
  const lines: Array<[number, string]> = [];
  let inBlock = false;
  text.split("\n").forEach((raw, index) => {
    let line = raw;
    if (inBlock) {
      if (line.includes("*/")) {
        inBlock = false;
        line = line.slice(line.indexOf("*/") + 2);
      } else {
        return;
      }
    }
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
    if (trimmed.startsWith("/*")) {
      if (!trimmed.includes("*/")) inBlock = true;
      return;
    }
    lines.push([index + 1, line.replace(/\s\/\/.*$/, "")]);
  });
  return lines;
}

test("no runtime code carries a daily port, Keychain name or state path outside shared/stack.ts", () => {
  const rules: Array<[string, RegExp]> = [
    ["a service port", /\b43(19|20|21)\b/],
    ["a Keychain name", /com\.usefulbot\./],
    ["the state folder", /\.useful-bot(?![a-z0-9_])/i],
  ];
  const offenders: string[] = [];
  for (const dir of SCAN_DIRS) {
    for (const file of sourceFiles(dir)) {
      if (ALLOW.has(file)) continue;
      for (const [lineNo, line] of codeLines(readFileSync(join(ROOT, file), "utf8"))) {
        for (const [label, pattern] of rules) {
          if (pattern.test(line)) offenders.push(`${file}:${lineNo} ${label}: ${line.trim().slice(0, 100)}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], `daily literals outside shared/stack.ts:\n${offenders.join("\n")}`);
  for (const file of ALLOW) assert.ok(existsSync(join(ROOT, file)), `allowlisted file is gone: ${file}`);
});
