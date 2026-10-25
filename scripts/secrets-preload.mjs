// Loaded first in every service (`node --import scripts/secrets-preload.mjs ...`).
//
// Reads one JSON object of secrets from stdin until EOF and puts them in
// `process.env`. Values set at runtime are not in the kernel's copy of the
// exec environment, which any process of the same user can read on macOS, so
// the service has its secrets and a shell line the bot runs cannot see them.
// scripts/service-secrets.mjs is the writer. Empty input is fine (no secrets).
//
// Then it keeps them out of the service's children: every child_process call
// made here drops these names from the environment it hands on (the default
// is a copy of `process.env`, which now holds them). A forked node child, such
// as Next's dev server, gets them through its own stdin the same way instead.
import childProcess from "node:child_process";
import { readSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { isatty } from "node:tty";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

function die(error) {
  process.stderr.write(`${JSON.stringify({ service: "secrets-preload", error })}\n`);
  process.exit(2);
}

// Synchronous, so the secrets are set before the first line of the service
// runs. A pipe can report EAGAIN while the writer has not written yet.
function readStdin() {
  if (isatty(0)) return "";
  const chunks = [];
  const buffer = Buffer.alloc(65536);
  const deadline = Date.now() + 10_000;
  for (;;) {
    let count;
    try {
      count = readSync(0, buffer, 0, buffer.length, null);
    } catch (error) {
      if (error.code === "EOF") break;
      if (error.code === "EAGAIN" && Date.now() < deadline) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
        continue;
      }
      die("secrets_unreadable");
    }
    if (count === 0) break;
    chunks.push(Buffer.from(buffer.subarray(0, count)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parse(text) {
  if (!text.trim()) return {};
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    die("secrets_invalid");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) die("secrets_invalid");
  for (const [key, secret] of Object.entries(value)) {
    if (!/^UB_[A-Z0-9_]+$/.test(key) || typeof secret !== "string") die("secrets_invalid");
  }
  return value;
}

const secrets = parse(readStdin());
const names = Object.keys(secrets);
for (const name of names) process.env[name] = secrets[name];

const isOptions = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/** `env` (default: this process's) without the secret names, plus the secrets it held. */
function split(env) {
  const source = env ?? process.env;
  const held = {};
  for (const name of names) {
    if (name in source && source[name] !== undefined) held[name] = source[name];
  }
  if (Object.keys(held).length === 0) return { env, held };
  const rest = { ...source };
  for (const name of names) delete rest[name];
  return { env: rest, held };
}

/** `args` with the options object's env stripped; the options object is added when the call had none. */
function stripped(args, hasArgsArray) {
  const out = [...args];
  let at = 1;
  if (hasArgsArray && Array.isArray(out[at])) at += 1;
  if (isOptions(out[at])) {
    const { env, held } = split(out[at].env);
    if (Object.keys(held).length > 0) out[at] = { ...out[at], env };
  } else {
    const { env, held } = split(undefined);
    if (Object.keys(held).length > 0) out.splice(at, 0, { env });
  }
  return out;
}

if (names.length > 0) {
  for (const [name, hasArgsArray] of [["spawn", true], ["spawnSync", true], ["execFile", true], ["execFileSync", true], ["exec", false], ["execSync", false]]) {
    const original = childProcess[name];
    const wrapped = (...args) => original(...stripped(args, hasArgsArray));
    if (original[promisify.custom]) {
      wrapped[promisify.custom] = (...args) => original[promisify.custom](...stripped(args, hasArgsArray));
    }
    childProcess[name] = wrapped;
  }

  const preload = pathToFileURL(fileURLToPath(import.meta.url)).href;
  const originalFork = childProcess.fork;
  childProcess.fork = (modulePath, ...rest) => {
    const args = Array.isArray(rest[0]) ? rest.shift() : [];
    const options = isOptions(rest[0]) ? rest[0] : {};
    const { env, held } = split(options.env);
    if (Object.keys(held).length === 0) return originalFork(modulePath, args, options);
    // The child gets what it held on its stdin, read by this same preload.
    let stdio = options.stdio;
    if (stdio === undefined) stdio = options.silent ? ["pipe", "pipe", "pipe", "ipc"] : ["pipe", "inherit", "inherit", "ipc"];
    else if (typeof stdio === "string") stdio = ["pipe", stdio, stdio, "ipc"];
    else stdio = ["pipe", ...stdio.slice(1), ...(stdio.includes("ipc") ? [] : ["ipc"])];
    const execArgv = [...(options.execArgv ?? process.execArgv)];
    if (!execArgv.includes(preload)) execArgv.push("--import", preload);
    const child = originalFork(modulePath, args, { ...options, env, stdio, execArgv });
    child.stdin.on("error", (error) => {
      if (error.code !== "EPIPE") throw error;
    });
    child.stdin.end(`${JSON.stringify(held)}\n`);
    return child;
  };
  syncBuiltinESMExports();
}
