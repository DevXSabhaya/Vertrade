import type { ITimerScheduler } from '@shared/scheduler/timer-scheduler.interface';

interface ScheduledTimeout {
  readonly kind: 'timeout';
  readonly callback: () => void;
  readonly delayMs: number;
  cancelled: boolean;
}

interface ScheduledInterval {
  readonly kind: 'interval';
  readonly callback: () => void;
  readonly intervalMs: number;
  cancelled: boolean;
}

/**
 * A fully manual, no-real-timers-ever ITimerScheduler test double: scheduling
 * just records the callback, and tests decide exactly when (and whether) it
 * fires by calling fireTimeout()/fireInterval() themselves. This is what
 * makes reconnect-backoff, heartbeat-watchdog, and mock-tick-interval
 * behavior 100% deterministic in tests — no waiting on real wall-clock time
 * anywhere in this module's test suite.
 */
export class FakeTimerScheduler implements ITimerScheduler {
  private nextHandle = 1;
  private readonly timeouts = new Map<number, ScheduledTimeout>();
  private readonly intervals = new Map<number, ScheduledInterval>();

  setTimeout(callback: () => void, delayMs: number): unknown {
    const handle = this.nextHandle++;
    this.timeouts.set(handle, {
      kind: 'timeout',
      callback,
      delayMs,
      cancelled: false,
    });
    return handle;
  }

  clearTimeout(handle: unknown): void {
    const entry = this.timeouts.get(handle as number);
    if (entry) {
      entry.cancelled = true;
    }
  }

  setInterval(callback: () => void, intervalMs: number): unknown {
    const handle = this.nextHandle++;
    this.intervals.set(handle, {
      kind: 'interval',
      callback,
      intervalMs,
      cancelled: false,
    });
    return handle;
  }

  clearInterval(handle: unknown): void {
    const entry = this.intervals.get(handle as number);
    if (entry) {
      entry.cancelled = true;
    }
  }

  /** Fires every pending (non-cancelled) setTimeout callback once. */
  fireAllTimeouts(): void {
    for (const entry of this.timeouts.values()) {
      if (!entry.cancelled) {
        entry.callback();
      }
    }
  }

  /** Fires every registered (non-cancelled) setInterval callback once. */
  fireAllIntervals(): void {
    for (const entry of this.intervals.values()) {
      if (!entry.cancelled) {
        entry.callback();
      }
    }
  }

  pendingTimeoutCount(): number {
    return Array.from(this.timeouts.values()).filter((e) => !e.cancelled)
      .length;
  }

  pendingIntervalCount(): number {
    return Array.from(this.intervals.values()).filter((e) => !e.cancelled)
      .length;
  }
}
