/**
 * Shared by the reconnect-backoff util (used inside DhanMarketDataProvider
 * for its own socket-level reconnects) and MarketDataService's provider-agnostic
 * heartbeat-staleness watchdog, so both apply the exact same policy.
 */
export interface ReconnectOptions {
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly maxRetries: number;
  readonly jitterRatio: number;
  readonly heartbeatTimeoutMs: number;
  readonly heartbeatCheckIntervalMs: number;
}

export const DEFAULT_RECONNECT_OPTIONS: ReconnectOptions = {
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
  maxRetries: 10,
  jitterRatio: 0.2,
  heartbeatTimeoutMs: 15_000,
  heartbeatCheckIntervalMs: 5_000,
};
