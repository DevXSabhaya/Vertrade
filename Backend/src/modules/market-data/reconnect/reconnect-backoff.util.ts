import type { ReconnectOptions } from '../models/reconnect-options.model';

/**
 * Pure, deterministic (given a fixed randomSource) exponential backoff with
 * jitter. Used both by AngelOneMarketDataProvider's own socket-level
 * reconnects and by MarketDataService's provider-agnostic heartbeat-staleness
 * watchdog, so the exact same policy applies everywhere reconnection happens
 * — even when the active provider is the Mock one.
 */
export const ReconnectBackoff = {
  /** attempt is 1-indexed: the first retry is attempt 1. */
  computeDelayMs(
    attempt: number,
    options: Pick<
      ReconnectOptions,
      'baseDelayMs' | 'maxDelayMs' | 'jitterRatio'
    >,
    randomSource: () => number = Math.random,
  ): number {
    const exponential = Math.min(
      options.maxDelayMs,
      options.baseDelayMs * 2 ** (attempt - 1),
    );
    const jitter = exponential * options.jitterRatio * randomSource();
    return Math.round(Math.min(options.maxDelayMs, exponential + jitter));
  },

  hasExceededMaxRetries(
    attempt: number,
    options: Pick<ReconnectOptions, 'maxRetries'>,
  ): boolean {
    return attempt > options.maxRetries;
  },
};
