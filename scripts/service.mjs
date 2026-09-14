#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac } from "node:crypto";
import { createServer } from "node:net";

const NODE = "/usr/local/bin/node";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];

const [NODE_MAJOR, NODE_MINOR, NODE_PATCH] = process.versions.node.split(".").map(Number);
if (NODE_MAJOR !== 24 || NODE_MINOR < 11 || (NODE_MINOR === 11 && NODE_PATCH < 1)) {
  process.stderr.write(`service refuses Node ${process.versions.node}, need >=24.11.1 <25\n`);
  process.exit(2);
}

const KEYCHAIN_TIMEOUT_MS = 15_000;

const SERVICE_PORTS = {
  router: { host: "127.0.0.1", port: 4319 },
  eve: { host: "127.0.0.1", port: 4321 },
  web: { host: "127.0.0.1", port: 4320 },
};

function fail(code, item) {
  process.stderr.write(`${JSON.stringify({ error: code, item })}\n`);
  process.exit(1);
}

function preflightPort(host, port) {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", (error) => {
      reject(new Error(error && error.code === "EADDRINUSE" ? "port_in_use" : "port_check_failed"));
    });
    probe.listen(port, host, () => {
      probe.close(() => resolve());
    });
  });
}

function keychain(service) {
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/security", ["find-generic-password", "-s", service, "-w"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let settled = false;
    let timer;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      out = "";
      if (error) reject(error);
      else resolve(value);
    };
    timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error("timeout"));
    }, KEYCHAIN_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => { out += chunk.toString(); });
    child.stderr.on("data", () => {});
    child.on("error", () => finish(new Error("missing")));
    child.on("close", (status) => {
      const value = out.trim();
      if (status !== 0 || !value) finish(new Error("missing"));
      else finish(null, value);
    });
  });
}

function signChannelJwt(secret, sub) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    sub,
    iss: "useful-bot",
    aud: "useful-bot",
    iat: now,
    exp: now + 12 * 60 * 60,
  })).toString("base64url");
  const sig = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

async function childEnv() {
  const env = {
    ...process.env,
    PATH: "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    NODE_ENV: process.env.NODE_ENV || "production",
  };
  if (process.env.UB_SKIP_KEYCHAIN === "1") {
    return env;
  }
  try {
    env.UB_OPENCODE_GO_KEY = await keychain("com.usefulbot.opencode-go");
  } catch {
    fail("credential_store_locked_or_missing", "com.usefulbot.opencode-go");
  }
  return env;
}

function run(args, env) {
  const child = spawn(NODE, args, { cwd: ROOT, env, stdio: "inherit" });
  const stop = () => {
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }, 10_000).unref();
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  child.on("exit", (code) => process.exit(code ?? 1));
}

async function waitReady(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  fail("dependency_unavailable", url);
}

async function main() {
  if (!existsSync(NODE)) fail("interpreter_missing", NODE);
  const target = SERVICE_PORTS[mode];
  if (target) {
    try {
      await preflightPort(target.host, target.port);
    } catch (error) {
      fail(error.message, `${target.host}:${target.port}`);
    }
  }
  if (mode === "router") {
    const env = await childEnv();
    if (!env.UB_ROUTER_CONFIG) {
      env.UB_ROUTER_CONFIG = path.join(process.env.HOME ?? "", ".useful-bot/config.json");
    }
    run(["--experimental-strip-types", path.join(ROOT, "router/src/index.ts")], env);
    return;
  }
  if (mode === "eve") {
    await waitReady("http://127.0.0.1:4319/health/live", 60_000);
    const env = {
      ...process.env,
      PATH: "/usr/local/bin:/usr/bin:/bin",
      NODE_ENV: process.env.NODE_ENV || "production",
    };
    try {
      env.UB_CHANNEL_JWT_SECRET = await keychain("com.usefulbot.channel.desktop");
      env.UB_ROUTER_DESKTOP_TOKEN = await keychain("com.usefulbot.router.desktop");
    } catch {
      fail("credential_store_locked_or_missing", "com.usefulbot.channel.desktop");
    }
    // Lets an agent tool wake the handoff pump at once instead of waiting for
    // the next web poll. Best effort: the poll drains the same queue.
    env.UB_WEB_BASE_URL = process.env.UB_WEB_BASE_URL || "http://127.0.0.1:4320";
    run([path.join(ROOT, "node_modules/eve/bin/eve.js"), "dev", "--no-ui", "--host", "127.0.0.1", "--port", "4321"], env);
    return;
  }
  if (mode === "web") {
    const env = {
      ...process.env,
      PATH: "/usr/local/bin:/usr/bin:/bin",
      UB_ROUTER_CONFIG: process.env.UB_ROUTER_CONFIG ?? path.join(process.env.HOME ?? "", ".useful-bot/config.json"),
    };
    try {
      const secret = await keychain("com.usefulbot.channel.desktop");
      env.UB_CHANNEL_JWT = signChannelJwt(secret, "desktop-app");
      // The agent tool wakes the handoff pump with the raw secret as its key
      // (see shared/agents-send.ts). Without it here every wake-up would 403
      // and only the UI poll would drain the queue.
      env.UB_CHANNEL_JWT_SECRET = secret;
    } catch {
      fail("credential_store_locked_or_missing", "com.usefulbot.channel.desktop");
    }
    run([
      path.join(ROOT, "node_modules/next/dist/bin/next"),
      "dev",
      path.join(ROOT, "web"),
      "--hostname",
      "127.0.0.1",
      "--port",
      "4320",
    ], env);
    return;
  }
  process.stderr.write("usage: service.mjs router|eve|web\n");
  process.exit(2);
}

main();
