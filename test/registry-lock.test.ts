import test from "node:test";
import { join } from "node:path";
import { loadRegistry } from "../router/src/registry.ts";

test("registry package-lock hashes match the committed lockfile", () => {
  loadRegistry(join(process.cwd(), "package-lock.json"));
});
