import type { ITimerScheduler } from '@shared/scheduler/timer-scheduler.interface';

interface ScheduledEntry {
  readonly callback: () => void;
  cancelled: boolean;
}

/** A fully manual, no-real-timers-ever ITimerScheduler test double (same pattern as Phases 6-7). */
export class FakeTimerScheduler implements ITimerScheduler {
  private nextHandle = 1;
  private readonly timeouts = new Map<number, ScheduledEntry>();
  private readonly intervals = new Map<number, ScheduledEntry>();

  setTimeout(callback: () => void): unknown {
    const handle = this.nextHandle++;
    this.timeouts.set(handle, { callback, cancelled: false });
    return handle;
  }

  clearTimeout(handle: unknown): void {
    const entry = this.timeouts.get(handle as number);
    if (entry) {
      entry.cancelled = true;
    }
  }

  setInterval(callback: () => void): unknown {
    const handle = this.nextHandle++;
    this.intervals.set(handle, { callback, cancelled: false });
    return handle;
  }

  clearInterval(handle: unknown): void {
    const entry = this.intervals.get(handle as number);
    if (entry) {
      entry.cancelled = true;
    }
  }

  fireAllTimeouts(): void {
    for (const entry of this.timeouts.values()) {
      if (!entry.cancelled) {
        entry.callback();
      }
    }
  }

  fireAllIntervals(): void {
    for (const entry of this.intervals.values()) {
      if (!entry.cancelled) {
        entry.callback();
      }
    }
  }

  pendingIntervalCount(): number {
    return Array.from(this.intervals.values()).filter((e) => !e.cancelled)
      .length;
  }
}
