import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/** Everything a web route can import: the app itself and the shared code it reaches. */
const SOURCE_DIRS = ["web/app", "web/components", "web/lib", "web/public", "shared", "agent", "router/src"];
// Not the lockfile: eve restamps it on its first boot, which would mark every
// build stale the moment the services started.
const SOURCE_FILES = ["web/next.config.ts", "web/postcss.config.mjs"];

export function standaloneServer(root) {
  return path.join(root, "web/.next/standalone/web/server.js");
}

function newestMtime(target) {
  let stat;
  try {
    stat = statSync(target);
  } catch {
    return 0;
  }
  if (!stat.isDirectory()) return stat.mtimeMs;
  let newest = 0;
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    newest = Math.max(newest, newestMtime(path.join(target, entry.name)));
  }
  return newest;
}

/**
 * How the web service should run. This checkout is both where the code is
 * edited and what the installed app runs, so a production build is only served
 * while it is newer than every source it was made from. Anything else runs the
 * dev server, which always reflects the files on disk, and says why.
 *
 * `next dev` costs about 270 MB and compiles each route on its first hit; the
 * built server is what `npm run build:app` leaves behind.
 */
export function webLaunch(root, env = process.env) {
  if (env.UB_WEB_MODE === "dev") return { mode: "dev", reason: "UB_WEB_MODE=dev" };
  const server = standaloneServer(root);
  const buildId = path.join(root, "web/.next/BUILD_ID");
  const statics = path.join(root, "web/.next/standalone/web/.next/static");
  if (!existsSync(server) || !existsSync(buildId) || !existsSync(statics)) {
    return { mode: "dev", reason: "web_build_missing" };
  }
  const builtAt = statSync(buildId).mtimeMs;
  const sources = [...SOURCE_DIRS, ...SOURCE_FILES].map((item) => newestMtime(path.join(root, item)));
  if (Math.max(...sources) > builtAt) return { mode: "dev", reason: "web_build_stale" };
  return { mode: "production", reason: "web_build_fresh", server };
}
