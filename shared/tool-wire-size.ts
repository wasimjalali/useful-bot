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
 * envelope.
 *
 * A tool this app mounts itself is weighed exactly, by asking zod to emit
 * what it will send. An OpenAPI connection cannot be: eve builds those tools
 * from the spec and never hands them back, and its emission is bigger than
 * the spec text it came from. The parameters of each operation get an object
 * wrapper, an `additionalProperties` and often a `$schema`; an operation with
 * no `operationId` gets a name derived from its path that the spec never
 * spelled out; and the same re-emission that runs about twice the raw bytes
 * for an MCP schema runs on these too. So a spec is charged a deliberate
 * over-estimate, and it is called that rather than called exact.
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

/**
 * What a measured OpenAPI connection is charged: its resolved schema text at
 * the rate eve's re-emission runs, its operation text, and per operation an
 * envelope plus the wrapper and synthesised name the spec does not carry.
 * An over-estimate on purpose, because the alternative is a figure the wire
 * beats and a chat that dies for it.
 */
const SPEC_EMISSION_RATE = 2.5;
const PER_OPERATION_OVERHEAD = ENVELOPE_BYTES + 120;

export function specWireBytes(size: SpecSize): number {
  return Math.ceil(size.schemaBytes * SPEC_EMISSION_RATE)
    + size.textBytes
    + size.operations * PER_OPERATION_OVERHEAD;
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

function scalarBytes(value: unknown): number {
  if (typeof value === "string") return utf8(value) + 2;
  if (typeof value === "number" || typeof value === "boolean") return String(value).length;
  return 4;
}

function resolvedBytes(walk: Walk, node: unknown, depth: number): number {
  if (walk.truncated) return 0;
  if (++walk.nodes > MAX_NODES || depth > MAX_REF_DEPTH) {
    walk.truncated = true;
    return 0;
  }
  // Every aggregate is walked, never stringified: one `JSON.stringify` of a
  // subtree is unbounded work that the node count cannot see, and a document
  // can hold a great many of them.
  if (Array.isArray(node)) {
    let total = 2;
    for (const item of node) {
      if (walk.truncated) return 0;
      total += resolvedBytes(walk, item, depth + 1) + 1;
    }
    return total;
  }
  const rec = asRecord(node);
  if (!rec) return scalarBytes(node);
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
    total += Array.isArray(value) || asRecord(value)
      ? resolvedBytes(walk, value, depth + 1)
      : scalarBytes(value);
  }
  return total;
}

export type SpecSize = {
  operations: number;
  /** Argument-schema bytes across every operation, resolved. */
  schemaBytes: number;
  /**
   * Name and description bytes across every operation. eve puts an
   * operation's `operationId`, `summary` and `description` into the tool it
   * builds, and a spec that documents itself properly carries paragraphs of
   * them: a flat rate per operation undercounted exactly the specs most
   * likely to be large.
   */
  textBytes: number;
};

export function measureOpenApiSpec(spec: unknown): SpecSize | null {
  const root = asRecord(spec);
  const paths = asRecord(root?.paths);
  if (!root || !paths) return null;
  const walk: Walk = { root, nodes: 0, truncated: false };
  let operations = 0;
  let schemaBytes = 0;
  let textBytes = 0;
  for (const item of Object.values(paths)) {
    const path = asRecord(item);
    if (!path) continue;
    const shared = Array.isArray(path.parameters) ? path.parameters : [];
    for (const [method, value] of Object.entries(path)) {
      if (!METHODS.has(method.toLowerCase())) continue;
      const operation = asRecord(value);
      if (!operation) continue;
      operations += 1;
      for (const field of ["operationId", "summary", "description"]) {
        const text = operation[field];
        if (typeof text === "string") textBytes += utf8(text);
      }
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
  return walk.truncated ? null : { operations, schemaBytes, textBytes };
}
