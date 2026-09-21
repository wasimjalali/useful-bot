/**
 * At most one running pump and one waiting behind it. A third caller does not
 * start another chain: it joins the waiter and reports `coalesced`, which is
 * what S14 requires of the tick. The waiter runs once the current pump
 * finishes, so a handoff queued before that start is still delivered.
 */

type Waiter<T> = {
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

export class CoalescedPump<T> {
  private readonly run: (limit: number) => Promise<T>;
  private active: Promise<void> | null = null;
  private pending: { limit: number; waiters: Waiter<T>[] } | null = null;

  constructor(run: (limit: number) => Promise<T>) {
    this.run = run;
  }

  schedule(limit: number): { coalesced: boolean; promise: Promise<T> } {
    if (this.active && this.pending) {
      this.pending.limit = Math.max(this.pending.limit, limit);
      return { coalesced: true, promise: this.enqueue(this.pending.waiters) };
    }
    if (this.active) {
      const waiters: Waiter<T>[] = [];
      this.pending = { limit, waiters };
      return { coalesced: false, promise: this.enqueue(waiters) };
    }
    const waiters: Waiter<T>[] = [];
    const promise = this.enqueue(waiters);
    this.begin(limit, waiters);
    return { coalesced: false, promise };
  }

  private enqueue(waiters: Waiter<T>[]): Promise<T> {
    return new Promise((resolve, reject) => {
      waiters.push({ resolve, reject });
    });
  }

  private begin(limit: number, waiters: Waiter<T>[]): void {
    const job = this.run(limit).then(
      (value) => {
        for (const waiter of waiters) waiter.resolve(value);
      },
      (error: unknown) => {
        for (const waiter of waiters) waiter.reject(error);
      },
    );
    this.active = job.finally(() => {
      this.active = null;
      const next = this.pending;
      this.pending = null;
      if (next) this.begin(next.limit, next.waiters);
    });
  }
}
