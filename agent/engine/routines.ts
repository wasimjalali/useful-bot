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

/** The routine store calls the scheduler makes, so a test can make one of them fail. */
export type RoutineStore = {
  pending: typeof pendingRoutines;
  claimManual: typeof claimManualRun;
  claimDue: typeof claimDueRoutine;
  appendRun: typeof appendRoutineRun;
};

export type RoutineOptions = {
  tickMs?: number;
  maxRunning?: number;
  budgetMs?: number;
  idleMs?: number;
  checkMs?: number;
  store?: Partial<RoutineStore>;
};

type Claimed = { routine: Routine };

const DEFAULTS = { tickMs: 20_000, maxRunning: 4, budgetMs: 60 * 60_000, idleMs: 10 * 60_000, checkMs: 5_000 };

function logFailure(event: string, fields: Record<string, unknown>, error: unknown): void {
  console.error(JSON.stringify({ event, ...fields, error: error instanceof Error ? (error.stack ?? error.message) : String(error) }));
}

export class RoutineScheduler {
  private readonly options: typeof DEFAULTS;
  private readonly store: RoutineStore;
  private readonly running = new Map<string, Promise<void>>();
  private timer: NodeJS.Timeout | null = null;

  private readonly engine: Engine;

  constructor(engine: Engine, options: RoutineOptions = {}) {
    this.engine = engine;
    const { store, ...rest } = options;
    this.options = { ...DEFAULTS, ...rest };
    this.store = { pending: pendingRoutines, claimManual: claimManualRun, claimDue: claimDueRoutine, appendRun: appendRoutineRun, ...store };
  }

  start(): void {
    if (this.timer) return;
    // A store that fails must not take the engine down: the next tick tries again.
    this.timer = setInterval(() => {
      try {
        this.tick();
      } catch (error) {
        logFailure("routine_tick_failed", {}, error);
      }
    }, this.options.tickMs);
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
    this.engine.sweepRoutineLinks();
    let candidates: Routine[];
    try {
      candidates = this.store.pending(now);
    } catch (error) {
      console.error(JSON.stringify({ event: "routines_unreadable", error: error instanceof Error ? error.message : String(error) }));
      return started;
    }
    for (const routine of candidates) {
      if (this.running.size >= this.options.maxRunning) break;
      if (this.running.has(routine.id)) continue;
      let claimed: Claimed | null;
      try {
        claimed = this.store.claimManual(routine.id) ?? this.store.claimDue(routine.id, now);
      } catch (error) {
        // One routine whose claim fails must not starve the others.
        logFailure("routine_tick_failed", { routineId: routine.id }, error);
        continue;
      }
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
    try {
      return this.begin(claimed.routine);
    } catch (error) {
      this.recordFailure(claimed.routine, null, error);
      throw error;
    }
  }

  private begin(routine: Routine): { chatId: string; turnId: string | null; queued: boolean } {
    const index = this.engine.host.index;
    // The index is the truth: a routine's chat is the one that names it, created on its first run.
    const known = index.all().find((meta) => meta.routineId === routine.id) ?? (routine.chatId ? index.get(routine.chatId) : undefined);
    let chatId = known?.chatId;
    if (!chatId) {
      chatId = index.create({ botId: routine.botId, title: routine.name, routineId: routine.id }).chatId;
      this.engine.host.deps.setRoutineChat(routine.id, chatId);
    } else if (routine.chatId !== chatId) {
      this.engine.host.deps.setRoutineChat(routine.id, chatId);
    }
    const chat = this.engine.host.chat(chatId);
    const stamp = this.engine.host.now().toISOString();
    const prompt = `Scheduled run of the routine ${routine.name}. Nobody is watching: do not ask questions or wait for cards.\n\n${routine.instruction}`;
    // The note goes in once the run is admitted (a refused run did not "run"), and still just before the turn starts.
    const submitted = this.engine.turns.submitInternal(chatId, "routine", `routine:${routine.id}:${stamp}`, prompt, () => {
      chat.appendRow({ key: `note:routine-run-${routine.id}-${stamp}`, kind: "note", text: `Routine ${routine.name} ran.`, source: "routine" });
    });
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
        this.store.appendRun(routine.id, { status: "ok", chatId });
      } else {
        const error = result.failure?.detail ?? (result.outcome === "cancelled" ? "The run was stopped." : "The run failed.");
        this.store.appendRun(routine.id, { status: "failed", chatId, error });
      }
    } catch (error) {
      // The run is over either way: a store that cannot record it is logged, not thrown into nowhere.
      logFailure("routine_run_record_failed", { routineId: routine.id, chatId }, error);
    } finally {
      clearInterval(timer);
    }
  }

  private recordFailure(routine: Routine, chatId: string | null, error: unknown): void {
    const detail = error instanceof EngineError && typeof error.fields.message === "string"
      ? error.fields.message
      : error instanceof EngineError ? error.code : error instanceof Error ? error.message : String(error);
    try {
      this.store.appendRun(routine.id, { status: "failed", ...(chatId ? { chatId } : {}), error: detail });
    } catch (recordError) {
      logFailure("routine_run_record_failed", { routineId: routine.id, chatId }, recordError);
    }
  }
}
