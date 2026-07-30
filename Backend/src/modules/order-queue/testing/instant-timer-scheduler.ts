import type { ITimerScheduler } from '@shared/scheduler/timer-scheduler.interface';

/**
 * Fires every `setTimeout` callback immediately (synchronously) rather than
 * waiting `delayMs` — used by tests so retry-backoff delays (real in
 * production via `NativeTimerScheduler`) never make the test suite slow or
 * flaky. Tests that need to assert the delay itself was requested (e.g.
 * respects `RetryStrategy.computeDelayMs`) should spy on `setTimeout`
 * directly instead of relying on this class's timing.
 */
export class InstantTimerScheduler implements ITimerScheduler {
  private nextHandle = 1;

  setTimeout(callback: () => void): unknown {
    callback();
    return this.nextHandle++;
  }

  clearTimeout(): void {
    // No-op: callbacks already fired synchronously, nothing left to cancel.
  }

  setInterval(): unknown {
    // Never used by QueueWorker — intervals aren't part of its retry path.
    return this.nextHandle++;
  }

  clearInterval(): void {
    // No-op, see setInterval.
  }
}
