/**
 * Every setTimeout/setInterval anywhere in Market Data (reconnect backoff,
 * heartbeat watchdogs, mock tick generation) goes through this abstraction —
 * never a bare global call — so tests can drive time deterministically
 * instead of waiting on real timers.
 */
export interface ITimerScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(callback: () => void, intervalMs: number): unknown;
  clearInterval(handle: unknown): void;
}
