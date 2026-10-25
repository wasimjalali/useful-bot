import {
  appendRoutineRun,
  claimDueRoutine,
  claimManualRun,
  claimRunNow,
  pendingRoutines,
  type Routine,
} from "../../shared/routines-store.ts";
import type { Engine } from "./engine.ts";
import { EngineError } from "./protocol.ts";
import type { TurnResult } from "./pi-host.ts";

/**
 * The routine scheduler (SPEC 5.11). A 20 second timer in the engine, at most
 * four runs at once and one per routine. A routine runs in its own chat,
 * created on its first run and reused, so a run never lands in the chat the
 * owner is typing in. The run is a turn with origin `routine`: no owner bubble,
 * a note row first, an hour of budget and ten minutes without events.
 */

export type RoutineOptions = {
  tickMs?: number;
  maxRunning?: number;
  budgetMs?: number;
  idleMs?: number;
  checkMs?: number;
};

type Claimed = { routine: Routine };

const DEFAULTS = { tickMs: 20_000, maxRunning: 4, budgetMs: 60 * 60_000, idleMs: 10 * 60_000, checkMs: 5_000 };

function chatOf(routine: Routine): string | null {
  return (routine as { chatId?: string | null }).chatId ?? null;
}

export class RoutineScheduler {
  private readonly options: typeof DEFAULTS;
  private readonly running = new Map<string, Promise<void>>();
  private timer: NodeJS.Timeout | null = null;

  private readonly engine: Engine;

  constructor(engine: Engine, options: RoutineOptions = {}) {
    this.engine = engine;
    this.options = { ...DEFAULTS, ...options };
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => { this.tick(); }, this.options.tickMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** How many runs are in flight (tests and the status poll). */
  get inFlight(): number {
    return this.running.size;
  }

  /** Starts what is due or requested, up to the cap. Returns the routine ids it started. */
  tick(now = new Date()): string[] {
    const started: string[] = [];
    let candidates: Routine[];
    try {
      candidates = pendingRoutines(now);
    } catch (error) {
      console.error(JSON.stringify({ event: "routines_unreadable", error: error instanceof Error ? error.message : String(error) }));
      return started;
    }
    for (const routine of candidates) {
      if (this.running.size >= this.options.maxRunning) break;
      if (this.running.has(routine.id)) continue;
      const claimed: Claimed | null = claimManualRun(routine.id) ?? claimDueRoutine(routine.id, now);
      if (!claimed) continue;
      try {
        this.begin(claimed.routine);
        started.push(routine.id);
      } catch (error) {
        this.recordFailure(claimed.routine, null, error);
      }
    }
    return started;
  }

  /** The owner's Run now: claims the routine and runs it in its chat. */
  runNow(routineId: string): { chatId: string; turnId: string | null; queued: boolean } {
    if (this.running.has(routineId)) throw new EngineError(409, "routine_busy");
    const claimed = claimRunNow(routineId);
    if (!claimed) throw new EngineError(404, "routine_missing");
    return this.begin(claimed.routine);
  }

  private begin(routine: Routine): { chatId: string; turnId: string | null; queued: boolean } {
    const index = this.engine.host.index;
    let chatId = chatOf(routine);
    if (!chatId || !index.get(chatId)) {
      chatId = index.create({ botId: routine.botId, title: routine.name, routineId: routine.id }).chatId;
      this.engine.host.deps.setRoutineChat(routine.id, chatId);
    }
    const chat = this.engine.host.chat(chatId);
    const stamp = this.engine.host.now().toISOString();
    chat.appendRow({ key: `note:routine-run-${routine.id}-${stamp}`, kind: "note", text: `Routine ${routine.name} ran.`, source: "routine" } as never);
    const prompt = `Scheduled run of the routine ${routine.name}. Nobody is watching: do not ask questions or wait for cards.\n\n${routine.instruction}`;
    const submitted = this.engine.turns.submitInternal(chatId, "routine", `routine:${routine.id}:${stamp}`, prompt);
    const finished = this.watch(routine, chatId, submitted.turnId, submitted.done);
    this.running.set(routine.id, finished);
    void finished.finally(() => { this.running.delete(routine.id); });
    return { chatId, turnId: submitted.turnId, queued: submitted.queued };
  }

  /** Enforces the budget and records the run when it ends. */
  private async watch(routine: Routine, chatId: string, turnId: string, done: Promise<TurnResult>): Promise<void> {
    const chat = this.engine.host.chat(chatId);
    const timer = setInterval(() => {
      const turn = chat.turn;
      if (!turn || turn.turnId !== turnId) return;
      const now = Date.now();
      if (now - turn.startedAt > this.options.budgetMs) this.engine.turns.abortTurn(chat, "budget");
      else if (now - turn.lastEventAt > this.options.idleMs) this.engine.turns.abortTurn(chat, "idle");
    }, this.options.checkMs);
    timer.unref();
    try {
      const result = await done;
      if (result.outcome === "completed") {
        appendRoutineRun(routine.id, { status: "ok", sessionId: null, chatId } as never);
      } else {
        const error = result.failure?.detail ?? (result.outcome === "cancelled" ? "The run was stopped." : "The run failed.");
        appendRoutineRun(routine.id, { status: "failed", sessionId: null, chatId, error } as never);
      }
    } finally {
      clearInterval(timer);
    }
  }

  private recordFailure(routine: Routine, chatId: string | null, error: unknown): void {
    const detail = error instanceof EngineError && typeof error.fields.message === "string"
      ? error.fields.message
      : error instanceof EngineError ? error.code : error instanceof Error ? error.message : String(error);
    appendRoutineRun(routine.id, { status: "failed", sessionId: null, ...(chatId ? { chatId } : {}), error: detail } as never);
  }
}
