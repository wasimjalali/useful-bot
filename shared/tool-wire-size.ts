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
/**
 * How far a `$ref` chain is followed, and how many nodes the whole walk may
 * visit. Resolution expands: a spec inside the one-megabyte read cap whose
 * schemas reference each other can describe a tree with more nodes than there
 * are bytes, so depth alone does not bound the work.
 *
 * A walk that hits either bound has not measured the spec, and a number it
 * cannot stand behind is worse than no number: the caller is told it could
 * not be measured and refuses the connect, rather than charging a figure the
 * wire will exceed.
 */
const MAX_REF_DEPTH = 12;
const MAX_NODES = 200_000;

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
 * The resolved JSON size of one schema node, and whether the walk got all the
 * way. A cycle, a reference this side cannot follow, or a document too big to
 * walk marks it truncated, and a truncated walk yields no number at all.
 */
type Walk = { root: Json; nodes: number; truncated: boolean };

function resolvedBytes(walk: Walk, node: unknown, depth: number): number {
  if (walk.truncated) return 0;
  if (++walk.nodes > MAX_NODES || depth > MAX_REF_DEPTH) {
    walk.truncated = true;
    return 0;
  }
  const rec = asRecord(node);
  if (!rec) return jsonBytes(node);
  if (typeof rec.$ref === "string") {
    const target = resolveRef(walk.root, rec.$ref);
    if (target === null || target === undefined) {
      // A reference this side cannot follow is a schema it cannot weigh.
      walk.truncated = true;
      return 0;
    }
    return resolvedBytes(walk, target, depth + 1);
  }
  let total = 2;
  for (const [key, value] of Object.entries(rec)) {
    if (walk.truncated) return 0;
    total += utf8(key) + 4;
    if (Array.isArray(value)) {
      total += 2;
      for (const item of value) total += resolvedBytes(walk, item, depth + 1) + 1;
    } else if (asRecord(value)) {
      total += resolvedBytes(walk, value, depth + 1);
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
  const walk: Walk = { root, nodes: 0, truncated: false };
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
        schemaBytes += resolvedBytes(walk, parameter, 0);
      }
      const body = asRecord(operation.requestBody);
      if (body) schemaBytes += resolvedBytes(walk, body, 0);
      // eve puts the operation's summary and description in the tool's own
      // description, which the caller adds; only the arguments are here.
      if (walk.truncated) return null;
    }
  }
  return walk.truncated ? null : { operations, schemaBytes };
}
