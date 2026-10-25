import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import {
  UB,
  type AttachmentsData,
  type FailureData,
  type OpenQuestion,
  type QueuedData,
  type QueuedDropData,
  type QuestionData,
  type Row,
  type SearchResult,
  type TurnOrigin,
  type TurnStartData,
} from "./protocol.ts";

/**
 * Rows are built from the session's active branch and nothing else (SPEC
 * 5.12): never from the compaction-aware context projection, which drops
 * summarized history. The same builder runs over a whole file and over entries
 * as they arrive, so a live row and a rebuilt one have the same id.
 *
 * Row ids: user `<turnId>:u`, assistant `<turnId>:a<n>` (n counts the turn's
 * text-bearing assistant messages from 0), failure `<turnId>:f`, question
 * `<turnId>:q`, compaction `compaction:<entryId>`, unsent `unsent:<clientId>`,
 * and the `key` of a `ub.row` entry for everything a tool filed.
 */

export const COMPACTION_NOTE = "Conversation compacted to fit the model's window";

/** What a pushed entry did to the row list, so the host can emit events. */
export type RowChange =
  | { type: "added"; row: Row }
  | { type: "replaced"; row: Row; previousRowId: string }
  | { type: "updated"; row: Row };

type TurnState = {
  turnId: string;
  origin: TurnOrigin;
  clientId?: string;
  assistantCount: number;
  userSeen: boolean;
  searchResults: SearchResult[];
};

type TextBlock = { type?: unknown; text?: unknown };

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  let out = "";
  for (const block of content as TextBlock[]) {
    if (block && block.type === "text" && typeof block.text === "string") out += block.text;
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function searchResultsOf(details: unknown): SearchResult[] {
  if (!isRecord(details) || !Array.isArray(details.searchResults)) return [];
  const out: SearchResult[] = [];
  for (const item of details.searchResults) {
    if (!isRecord(item)) continue;
    if (typeof item.title === "string" && typeof item.url === "string") {
      out.push({ title: item.title, url: item.url, snippet: typeof item.snippet === "string" ? item.snippet : "" });
    }
  }
  return out;
}

export class RowBuilder {
  readonly rows: Row[] = [];
  private readonly index = new Map<string, number>();
  private turn: TurnState | null = null;
  private readonly attachments = new Map<string, AttachmentsData>();
  /** Every client id a turn-start or a queued entry carried, for the idempotent send. */
  readonly clients = new Map<string, { turnId: string; queued: boolean }>();
  /** Keys of `ub.row` entries, for append idempotency. */
  readonly keys = new Set<string>();
  private questionRowId: string | null = null;

  static build(entries: Iterable<SessionEntry>): RowBuilder {
    const builder = new RowBuilder();
    for (const entry of entries) builder.push(entry);
    return builder;
  }

  has(rowId: string): boolean {
    return this.index.has(rowId);
  }

  get(rowId: string): Row | undefined {
    const at = this.index.get(rowId);
    return at === undefined ? undefined : this.rows[at];
  }

  /** The question still waiting for an answer, or null. */
  openQuestion(): OpenQuestion | null {
    if (!this.questionRowId) return null;
    const row = this.get(this.questionRowId);
    if (!row || row.kind !== "question" || !row.open) return null;
    return { requestId: row.requestId, prompt: row.prompt, options: row.options, allowFreeform: row.allowFreeform };
  }

  /** The turn id that rows of the current turn carry (null before any turn). */
  currentTurnId(): string | null {
    return this.turn?.turnId ?? null;
  }

  private add(row: Row): RowChange | null {
    if (this.index.has(row.rowId)) return null;
    this.index.set(row.rowId, this.rows.length);
    this.rows.push(row);
    return { type: "added", row };
  }

  /** Replaces a row in place (a queued bubble becoming its turn's, or an unsent one). */
  private swap(previousRowId: string, row: Row): RowChange {
    const at = this.index.get(previousRowId);
    if (at === undefined) throw new Error(`row_missing:${previousRowId}`);
    this.index.delete(previousRowId);
    this.index.set(row.rowId, at);
    this.rows[at] = row;
    return { type: "replaced", row, previousRowId };
  }

  push(entry: SessionEntry): RowChange[] {
    switch (entry.type) {
      case "message":
        return this.pushMessage(entry);
      case "compaction": {
        const change = this.add({
          rowId: `compaction:${entry.id}`,
          kind: "note",
          turnId: null,
          at: entry.timestamp,
          text: COMPACTION_NOTE,
          source: "compaction",
        });
        return change ? [change] : [];
      }
      case "custom":
        return this.pushCustom(entry.customType, entry.data, entry.timestamp);
      default:
        return [];
    }
  }

  private pushMessage(entry: Extract<SessionEntry, { type: "message" }>): RowChange[] {
    const message = entry.message as unknown as Record<string, unknown>;
    const turn = this.turn;
    if (message.role === "user") {
      if (!turn || turn.origin !== "owner" || turn.userSeen) return [];
      turn.userSeen = true;
      const attached = this.attachments.get(turn.turnId);
      const rowId = `${turn.turnId}:u`;
      const row: Row = {
        rowId,
        kind: "user",
        turnId: turn.turnId,
        at: entry.timestamp,
        text: attached ? attached.text : textOf(message.content),
        ...(turn.clientId ? { clientId: turn.clientId } : {}),
        attachments: attached ? attached.items : [],
      };
      return [this.index.has(rowId) ? this.swap(rowId, row) : (this.add(row) as RowChange)];
    }
    if (message.role === "assistant") {
      if (!turn) return [];
      const text = textOf(message.content);
      if (text.trim() === "") return [];
      const row: Row = {
        rowId: `${turn.turnId}:a${turn.assistantCount}`,
        kind: "assistant",
        turnId: turn.turnId,
        at: entry.timestamp,
        text,
        ...(turn.searchResults.length > 0 ? { searchResults: turn.searchResults } : {}),
      };
      turn.assistantCount += 1;
      turn.searchResults = [];
      const change = this.add(row);
      return change ? [change] : [];
    }
    if (message.role === "toolResult" && turn && message.toolName === "web_search") {
      turn.searchResults.push(...searchResultsOf(message.details));
    }
    return [];
  }

  private pushCustom(customType: string, data: unknown, at: string): RowChange[] {
    if (!isRecord(data)) return [];
    switch (customType) {
      case UB.turnStart: {
        const start = data as unknown as TurnStartData;
        this.turn = {
          turnId: start.turnId,
          origin: start.origin,
          ...(start.clientId ? { clientId: start.clientId } : {}),
          assistantCount: 0,
          userSeen: false,
          searchResults: [],
        };
        if (start.clientId) this.clients.set(start.clientId, { turnId: start.turnId, queued: false });
        // The next owner message closes an open question.
        if (start.origin === "owner") return this.closeQuestion();
        return [];
      }
      case UB.attachments: {
        const attached = data as unknown as AttachmentsData;
        this.attachments.set(attached.turnId, attached);
        return [];
      }
      case UB.queued: {
        const queued = data as unknown as QueuedData;
        this.clients.set(queued.clientId, { turnId: queued.turnId, queued: true });
        const change = this.add({
          rowId: `${queued.turnId}:u`,
          kind: "user",
          turnId: queued.turnId,
          at,
          text: queued.text,
          clientId: queued.clientId,
          attachments: queued.attachments ?? [],
          queued: true,
        });
        return change ? [change] : [];
      }
      case UB.queuedDrop: {
        const drop = data as unknown as QueuedDropData;
        const queuedRow = this.get(`${drop.turnId}:u`);
        if (!queuedRow || queuedRow.kind !== "user" || !queuedRow.queued) return [];
        this.clients.delete(drop.clientId);
        const unsent: Row = {
          rowId: `unsent:${drop.clientId}`,
          kind: "unsent",
          turnId: null,
          at,
          clientId: drop.clientId,
          text: queuedRow.text,
          reason: drop.reason,
        };
        return [this.swap(queuedRow.rowId, unsent)];
      }
      case UB.failure: {
        const failure = data as unknown as FailureData;
        const change = this.add({
          rowId: `${failure.turnId}:f`,
          kind: "failure",
          turnId: failure.turnId,
          at,
          code: failure.code,
          detail: failure.detail,
          ...(failure.retryAfterMs !== undefined ? { retryAfterMs: failure.retryAfterMs } : {}),
          ...(failure.resetsAt !== undefined ? { resetsAt: failure.resetsAt } : {}),
          messageKept: true,
        });
        return change ? [change] : [];
      }
      case UB.question: {
        const question = data as unknown as QuestionData;
        const rowId = `${question.turnId}:q`;
        const change = this.add({
          rowId,
          kind: "question",
          turnId: question.turnId,
          at,
          requestId: question.requestId,
          prompt: question.prompt,
          options: question.options,
          allowFreeform: question.allowFreeform,
          open: true,
        });
        if (change) this.questionRowId = rowId;
        return change ? [change] : [];
      }
      case UB.row: {
        const filed = data as { key: string; turnId: string | null } & Record<string, unknown>;
        this.keys.add(filed.key);
        const { key, turnId, ...fields } = filed;
        // A note a tool or the web service filed says where it came from; the default is "system".
        const withSource = fields.kind === "note" ? { source: "system", ...fields } : fields;
        const change = this.add({ rowId: key, turnId: turnId ?? null, at, ...withSource } as Row);
        return change ? [change] : [];
      }
      default:
        return [];
    }
  }

  private closeQuestion(): RowChange[] {
    if (!this.questionRowId) return [];
    const row = this.get(this.questionRowId);
    this.questionRowId = null;
    if (!row || row.kind !== "question" || !row.open) return [];
    const closed: Row = { ...row, open: false };
    this.rows[this.index.get(row.rowId) as number] = closed;
    return [{ type: "updated", row: closed }];
  }
}
