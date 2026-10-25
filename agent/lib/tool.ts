import type { ExtensionToolContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { z } from "zod";
import type { OkSnapshot } from "./turn-snapshot.ts";

/**
 * The tool contract of the Pi engine (SPEC 5.8). Every tool in agent/tools/
 * is written against `defineTool` and `ToolCtx` here; the engine host
 * (agent/engine/, W1) turns each one into a Pi `ToolDefinition` with
 * `toPiTool`, supplying the context for each call through a `CtxResolver`.
 *
 * Tools never import Pi themselves: this file is the only seam, so a later
 * engine swap rewrites `toPiTool` and nothing in agent/tools/.
 */

export type TurnOrigin = "owner" | "routine" | "system";

/** A transcript row a tool adds beside its result (SPEC 5.12). */
export type RowInput =
  | { key: string; kind: "note"; text: string }
  | { key: string; kind: "image"; imageId: string; prompt?: string }
  | { key: string; kind: "page"; mediaId: string; title: string; path: string }
  | { key: string; kind: "widget"; widgetId: string; callId: string }
  | { key: string; kind: "card"; proposalId: string };

export type ToolCtx = {
  chatId: string;
  botId: string;
  turnId: string;
  callId: string;
  origin: TurnOrigin;
  abortSignal: AbortSignal;
  /** Bot, frozen selection, window, permission, folder and context of this turn. */
  snapshot: OkSnapshot;
  /** Compatibility for helpers written against eve's ctx: `session.id` is the chat id. */
  session: { id: string; turn: { id: string } };
  /** Writes a `ub.row` entry and emits a `row` event. Idempotent by `row.key`. */
  appendRow(row: RowInput): Promise<void>;
};

/** Builds the context for one call. The host owns turn state, so it supplies this. */
export type CtxResolver = (callId: string, signal: AbortSignal | undefined, pi: ExtensionToolContext) => ToolCtx;

type TextPart = { type: "text"; text: string };
type ImagePart = { type: "image"; data: string; mimeType: string };

const OUTPUT = Symbol.for("useful-bot.tool-output");

/** What a tool returns when the model-facing content is not just its JSON result. */
export type ToolOutput = {
  readonly [OUTPUT]: true;
  content: (TextPart | ImagePart)[];
  /** Kept on the session entry for rows and the UI (for example `searchResults`). */
  details: unknown;
  /** Ends the turn after this batch (`ask`, which always runs alone). */
  terminate?: boolean;
};

export function toolOutput(
  content: (TextPart | ImagePart)[],
  details: unknown = undefined,
  options: { terminate?: boolean } = {},
): ToolOutput {
  return { [OUTPUT]: true, content, details, ...(options.terminate ? { terminate: true } : {}) };
}

function isToolOutput(value: unknown): value is ToolOutput {
  return typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[OUTPUT] === true;
}

export type ToolSpec<S extends z.ZodType> = {
  name: string;
  label?: string;
  description: string;
  inputSchema: S;
  /** Gated or stateful tools run one at a time (SPEC 5.8). */
  sequential?: boolean;
  /** Runs on the raw arguments before Pi validates them (the lenient-null coercions). */
  prepareArguments?: (raw: unknown) => unknown;
  execute(input: z.output<S>, ctx: ToolCtx): unknown;
};

export type UsefulTool<S extends z.ZodType = z.ZodType> = ToolSpec<S> & {
  label: string;
  /** Plain JSON Schema of the input, as declared to the model. */
  parameters: Record<string, unknown>;
  toPiTool(resolve: CtxResolver): ToolDefinition;
};

/** A string result goes to the model as is; anything else as JSON, kept in `details`. */
export function toPiResult(value: unknown): { content: (TextPart | ImagePart)[]; details: unknown; terminate?: boolean } {
  if (isToolOutput(value)) {
    return { content: value.content, details: value.details, ...(value.terminate ? { terminate: true } : {}) };
  }
  if (typeof value === "string") return { content: [{ type: "text", text: value }], details: undefined };
  return { content: [{ type: "text", text: JSON.stringify(value ?? null) }], details: value };
}

export function defineTool<S extends z.ZodType>(spec: ToolSpec<S>): UsefulTool<S> {
  const parameters = z.toJSONSchema(spec.inputSchema, { io: "input" }) as Record<string, unknown>;
  delete parameters.$schema;
  const label = spec.label ?? spec.name;
  return {
    ...spec,
    label,
    parameters,
    toPiTool(resolve) {
      const definition = {
        name: spec.name,
        label,
        description: spec.description,
        // Plain JSON Schema; Pi validates it (TypeBox schemas are JSON Schema too).
        parameters: parameters as unknown as ToolDefinition["parameters"],
        ...(spec.sequential ? { executionMode: "sequential" as const } : {}),
        ...(spec.prepareArguments ? { prepareArguments: spec.prepareArguments as ToolDefinition["prepareArguments"] } : {}),
        async execute(callId: string, params: unknown, signal: AbortSignal | undefined, _onUpdate: unknown, pi: ExtensionToolContext) {
          const input = spec.inputSchema.parse(params);
          const result = await spec.execute(input, resolve(callId, signal, pi));
          return toPiResult(result);
        },
      };
      return definition as unknown as ToolDefinition;
    },
  };
}
