import { join } from "node:path";
import { enforceStack, enginePort, LOOPBACK, routerApiBase, stackName, stateRoot } from "../shared/stack.ts";

/**
 * The engine service (SPEC 5.1): `node --experimental-strip-types agent/server.ts`,
 * started by `scripts/service.mjs engine` with an explicit environment. It
 * listens on 127.0.0.1:<enginePort>, answers /health at once and every other
 * route with 503 `engine_starting` until boot has finished.
 */

function die(code: number, payload: Record<string, unknown>): never {
  process.stderr.write(`${JSON.stringify({ service: "engine", ...payload })}\n`);
  process.exit(code);
}

enforceStack("engine");

const engineToken = process.env.UB_ENGINE_TOKEN;
if (!engineToken || !process.env.UB_ROUTER_DESKTOP_TOKEN) {
  die(2, { error: "tokens_missing", missing: [!engineToken ? "UB_ENGINE_TOKEN" : null, !process.env.UB_ROUTER_DESKTOP_TOKEN ? "UB_ROUTER_DESKTOP_TOKEN" : null].filter(Boolean) });
}

const engineDir = join(stateRoot(), "engine");
// service.mjs sets these; they are repeated here so a run from a shell cannot reach for ~/.pi or the network.
process.env.PI_OFFLINE = "1";
process.env.PI_SKIP_VERSION_CHECK = "1";
process.env.PI_TELEMETRY = "0";
process.env.PI_CODING_AGENT_DIR = join(engineDir, "pi");

const { createEngineServer } = await import("./engine/http.ts");
const { Engine } = await import("./engine/engine.ts");
const { loadDeps } = await import("./engine/deps.ts");
const { ApprovalStore, defaultApprovalsPath } = await import("./lib/approvals.ts");

const port = enginePort();
let engine: Awaited<ReturnType<typeof Engine.boot>> | null = null;
const server = createEngineServer({ token: engineToken as string, port, stack: stackName(), engine: () => engine });

server.on("error", (error: NodeJS.ErrnoException) => {
  die(1, { error: error.code === "EADDRINUSE" ? "port_in_use" : "listen_failed", port });
});

await new Promise<void>((resolve) => server.listen(port, LOOPBACK, resolve));

try {
  engine = await Engine.boot({
    engineDir,
    routerBaseUrl: routerApiBase(),
    routerToken: () => process.env.UB_ROUTER_DESKTOP_TOKEN as string,
    deps: await loadDeps(),
    approvals: new ApprovalStore(Date.now, defaultApprovalsPath()),
  });
} catch (error) {
  die(1, { error: "boot_failed", detail: error instanceof Error ? error.message : String(error) });
}
process.stdout.write(`${JSON.stringify({ service: "engine", event: "listening", port, epoch: engine.epoch })}\n`);

let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  // Exit within 10 s whatever is still running (SPEC 5.1).
  setTimeout(() => process.exit(1), 10_000).unref();
  server.closeAllConnections();
  await engine?.close().catch(() => undefined);
  server.close(() => process.exit(0));
}
process.on("SIGTERM", () => { void stop(); });
process.on("SIGINT", () => { void stop(); });
