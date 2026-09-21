/**
 * What a tool weighs on the wire, measured rather than estimated.
 *
 * The router refuses a turn whose tool array is bigger than
 * `MAX_TOOL_SCHEMA_BYTES` with a non-retryable error, and eve retires a
 * session that gets one. A budget that charges a flat rate per tool is not a
 * defence against that: an ordinary OpenAPI operation carries one to ten
 * kilobytes of schema, so a spec charged at a few hundred bytes an operation
 * passes a budget it clears by a factor of five on the wire.
 *
 * So both sides are weighed the way the router weighs them:
 * `Buffer.byteLength(JSON.stringify(tool))`, in UTF-8, including the function
 * envelope. Where the real schema cannot be seen, the number here is an upper
 * bound and says so, never a guess downward.
 */

/** `{"type":"function","function":{"name":…,"description":…,"parameters":…}}`. */
const ENVELOPE_BYTES = 76;

function utf8(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function jsonBytes(value: unknown): number {
  if (value === undefined || value === null) return 4;
  try {
    return utf8(JSON.stringify(value));
  } catch {
    return 0;
  }
}

/**
 * One tool's wire size from the three things that make it up. `schemaBytes`
 * is the argument schema's own JSON, which the caller measures or remembers.
 */
export function toolWireBytes(name: string, description: string, schemaBytes: number): number {
  return ENVELOPE_BYTES + utf8(name) + utf8(description) + schemaBytes;
}

export function schemaBytesOf(schema: Record<string, unknown> | null): number {
  return schema ? jsonBytes(schema) : 2;
}

/**
 * The bytes of argument schema an OpenAPI spec turns into.
 *
 * eve builds one tool per operation from the spec's own `parameters` and
 * `requestBody`, resolving `$ref` as it goes, so the emitted size is the
 * resolved size and not the spec's on-disk size: a spec that shares one
 * schema across forty operations emits it forty times. This walks the same
 * shape with the same resolution, bounded so a cyclic or deeply nested
 * document cannot run away, and returns null when it cannot tell.
 */
const METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);
const MAX_REF_DEPTH = 6;
/** A schema this side stops resolving is charged this much and no less. */
const UNRESOLVED_SCHEMA_BYTES = 4 * 1024;

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : null;
}

function resolveRef(root: Json, ref: string): unknown {
  if (!ref.startsWith("#/")) return null;
  let node: unknown = root;
  for (const part of ref.slice(2).split("/")) {
    const key = part.replace(/~1/g, "/").replace(/~0/g, "~");
    const rec = asRecord(node);
    if (!rec) return null;
    node = rec[key];
  }
  return node;
}

/**
 * The resolved JSON size of one schema node. Depth-bounded: past the limit a
 * node is charged the ceiling rather than followed, so a `$ref` cycle costs
 * time proportional to the bound and never loops.
 */
function resolvedBytes(root: Json, node: unknown, depth: number): number {
  if (depth > MAX_REF_DEPTH) return UNRESOLVED_SCHEMA_BYTES;
  const rec = asRecord(node);
  if (!rec) return jsonBytes(node);
  if (typeof rec.$ref === "string") {
    const target = resolveRef(root, rec.$ref);
    if (target === null || target === undefined) return UNRESOLVED_SCHEMA_BYTES;
    return resolvedBytes(root, target, depth + 1);
  }
  let total = 2;
  for (const [key, value] of Object.entries(rec)) {
    total += utf8(key) + 4;
    if (Array.isArray(value)) {
      total += 2 + value.reduce<number>((sum, item) => sum + resolvedBytes(root, item, depth + 1) + 1, 0);
    } else if (asRecord(value)) {
      total += resolvedBytes(root, value, depth + 1);
    } else {
      total += jsonBytes(value);
    }
  }
  return total;
}

export type SpecSize = {
  operations: number;
  /** Argument-schema bytes across every operation, resolved. */
  schemaBytes: number;
};

export function measureOpenApiSpec(spec: unknown): SpecSize | null {
  const root = asRecord(spec);
  const paths = asRecord(root?.paths);
  if (!root || !paths) return null;
  let operations = 0;
  let schemaBytes = 0;
  for (const item of Object.values(paths)) {
    const path = asRecord(item);
    if (!path) continue;
    const shared = Array.isArray(path.parameters) ? path.parameters : [];
    for (const [method, value] of Object.entries(path)) {
      if (!METHODS.has(method.toLowerCase())) continue;
      const operation = asRecord(value);
      if (!operation) continue;
      operations += 1;
      const parameters = [
        ...shared,
        ...(Array.isArray(operation.parameters) ? operation.parameters : []),
      ];
      for (const parameter of parameters) {
        schemaBytes += resolvedBytes(root, parameter, 0);
      }
      const body = asRecord(operation.requestBody);
      if (body) schemaBytes += resolvedBytes(root, body, 0);
      // eve puts the operation's summary and description in the tool's own
      // description, which the caller adds; only the arguments are here.
    }
  }
  return { operations, schemaBytes };
}
