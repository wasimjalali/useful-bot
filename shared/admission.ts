/**
 * Admission (UB-009): before a turn is sent, the fixed envelope it carries is
 * compared with the bot's model window. Refused with a plain sentence when it
 * does not fit, never clipped. Pure: callers read the notes and the brief and
 * pass their sizes in.
 *
 * The envelope is the shared prompt, the rendered context block, the notes
 * block, the tool schemas, the output reserve and, on a carry-over turn, the
 * brief.
 */
import { renderContext, estimateTokens, type ContextSnapshot } from "./context-blocks.ts";
import { catalogFor } from "./live-models.ts";
import { exactModelOption } from "./models.ts";
import { UNKNOWN_WINDOW_TOKENS } from "./policy.ts";
import { botSelection } from "./session-selection.ts";
import type { ProviderStore } from "./providers.ts";
import { DESCRIPTION_MAX, DEFAULT_BOT_ID, type ShellBot } from "./shell-store.ts";

/**
 * The system prompt before the bot's own context block: agent/instructions.md
 * plus what eve adds around it (the skills list and the like). Measured on the
 * wire as 7,444 characters (payload probe, evals/results/2026-10-02-ub009-prc/
 * probe-after), with agent and task_cancel switched off, as they are again
 * since sub-agents were removed. That leaves about 22% headroom for eve's
 * additions around the file (the skills list), which no test guards. A test
 * holds it at or above `wc -c` of the file.
 */
export const SHARED_PROMPT_CHARS = 9_100;
/**
 * The tools array eve sends, as JSON. The same probe put it at 26,434 characters
 * on the wire for 34 authored tools. scripts/tool-schema-size.mjs now weighs the
 * authored tools and eve's remaining defaults at 14,433 (it was 22,993 with the
 * eleven multi-bot tools and eve's agent and task_cancel); the same wire
 * overhead on top (about 5,400) gives about 19,800, so 21,000 leaves about 6%
 * headroom. Not re-probed on the wire; PR 3 replaces this with a measured value.
 */
export const TOOL_SCHEMA_CHARS = 21_000;
/** Room kept for the model's own answer. */
export const OUTPUT_RESERVE_TOKENS = 4096;

export type Envelope = {
  tokens: number;
  windowTokens: number;
  modelLabel: string;
  descriptionChars: number;
};

export type AdmissionInput = {
  bot: ShellBot;
  store: ProviderStore;
  /** Length of the rendered notes block. */
  notesChars: number;
  /**
   * Length of everything hidden the turn adds in front of the owner's message:
   * the carry-over brief, a retry note, a mention or routine line, and the
   * session-note framing around them. 0 when the turn carries none.
   */
  briefChars?: number;
  /**
   * Characters of tool schemas mounted on top of the built-in set: the OpenAPI
   * connections mounted every turn and the MCP tools this session already
   * picked up on demand. 0 when none.
   */
  mountedToolChars?: number;
};

export type Admission =
  | ({ ok: true } & Envelope)
  | ({ ok: false; code: "context_too_large"; message: string } & Envelope);

/** The plain sentence a refused send shows, whatever the surface. */
export const CONTEXT_TOO_LARGE_TEXT =
  "This bot's instructions and notes don't fit its model's context window. Shorten its instructions, remove notes or pick a model with a larger window.";
export const DESCRIPTION_TOO_LONG_TEXT =
  `This bot's instructions are over ${DESCRIPTION_MAX.toLocaleString("en-US")} characters. Shorten them in its settings.`;

/** True when the stored description is over the cap and the send must be refused. */
export function descriptionTooLong(bot: Pick<ShellBot, "description">): boolean {
  return bot.description.length > DESCRIPTION_MAX;
}

/** The window of one model, from the catalog row for exactly it; unknown is 32,768. */
export function windowFor(connectionId: string, modelId: string): { windowTokens: number; modelLabel: string } {
  const option = exactModelOption(modelId, catalogFor(connectionId));
  const tokens = option?.contextTokens;
  return {
    windowTokens: Number.isInteger(tokens) && (tokens as number) > 0 ? (tokens as number) : UNKNOWN_WINDOW_TOKENS,
    modelLabel: option?.label ?? modelId,
  };
}

/**
 * The "This turn" block is rendered with the longest values its fields take
 * (80-character names, a 40-character folder), so the estimate never falls
 * short of the real block.
 */
function worstCaseTurn(label: string, modelId: string, connection: string): ContextSnapshot["turn"] {
  const long = "x".repeat(80);
  return {
    owner: long,
    first: long,
    date: new Date(0),
    tz: "America/Argentina/ComodRivadavia",
    permission: "full_access",
    folder: "x".repeat(40),
    model: { label, id: modelId, connection },
    image: { label: long, id: long },
    firstChat: true,
  };
}

/** The context block this bot's turn carries. */
export function contextText(bot: ShellBot, turn: ContextSnapshot["turn"]): string {
  return renderContext({
    bot: { name: bot.name, label: bot.label, description: bot.description },
    turn,
  });
}

export function envelopeFor(input: AdmissionInput): Envelope {
  const selection = botSelection(input.bot, input.store);
  const { windowTokens, modelLabel } = windowFor(selection.connectionId, selection.modelId);
  const context = contextText(input.bot, worstCaseTurn(modelLabel, selection.modelId, selection.connectionId));
  const tokens = estimateTokens(SHARED_PROMPT_CHARS)
    + estimateTokens(context.length)
    + estimateTokens(input.notesChars)
    + estimateTokens(TOOL_SCHEMA_CHARS + (input.mountedToolChars ?? 0))
    + estimateTokens(input.briefChars ?? 0)
    + OUTPUT_RESERVE_TOKENS;
  return { tokens, windowTokens, modelLabel, descriptionChars: input.bot.description.length };
}

export function admission(input: AdmissionInput): Admission {
  const envelope = envelopeFor(input);
  if (envelope.tokens <= envelope.windowTokens) return { ok: true, ...envelope };
  return { ok: false, code: "context_too_large", message: CONTEXT_TOO_LARGE_TEXT, ...envelope };
}

/**
 * How many characters a carry-over brief may take: what is left of the window
 * after the fixed envelope, shared with the conversation that follows (half
 * each), and never more than the brief's own cap. Zero when nothing is left.
 */
export function briefBudgetChars(input: Omit<AdmissionInput, "briefChars">, cap: number): number {
  const envelope = envelopeFor({ ...input, briefChars: 0 });
  const roomTokens = envelope.windowTokens - envelope.tokens;
  if (roomTokens <= 0) return 0;
  return Math.min(cap, Math.floor((roomTokens * 3.5) / 2));
}

/** The Generalist's shipped text against what the owner has saved. */
export function seedFor(bot: ShellBot, seedText: string): { differs: boolean; text: string } | null {
  if (bot.id !== DEFAULT_BOT_ID || bot.kind !== "bot") return null;
  const squash = (text: string) => text.replace(/\s+/g, " ").trim();
  return { differs: squash(bot.description) !== squash(seedText), text: seedText };
}
