#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const NODE = "/usr/local/bin/node";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];

if (Number(process.versions.node.split(".")[0]) !== 24) {
  process.stderr.write(`service refuses Node ${process.versions.node}\n`);
  process.exit(2);
}

function fail(code, item) {
  process.stderr.write(`${JSON.stringify({ error: code, item })}\n`);
  process.exit(1);
}

function keychain(service) {
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/security", ["find-generic-password", "-s", service, "-w"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (chunk) => { out += chunk.toString(); });
    child.stderr.on("data", () => {});
    child.on("close", (status) => {
      const value = out.trim();
      out = "";
      if (status !== 0 || !value) {
        reject(new Error("missing"));
        return;
      }
      resolve(value);
    });
  });
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
  if (mode === "router") {
    const env = await childEnv();
    run(["--experimental-strip-types", path.join(ROOT, "router/src/index.ts")], env);
    return;
  }
  if (mode === "eve") {
    await waitReady("http://127.0.0.1:4319/health/live", 60_000);
    const env = { ...process.env, PATH: "/usr/local/bin:/usr/bin:/bin" };
    run([path.join(ROOT, "node_modules/eve/bin/eve.js"), "start", "--host", "127.0.0.1", "--port", "4321"], env);
    return;
  }
  if (mode === "web") {
    process.stderr.write(`${JSON.stringify({ error: "web_not_built", item: "PR 4" })}\n`);
    process.exit(2);
  }
  process.stderr.write("usage: service.mjs router|eve|web\n");
  process.exit(2);
}

main();
