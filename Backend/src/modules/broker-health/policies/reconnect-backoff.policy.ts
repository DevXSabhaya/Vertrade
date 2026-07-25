export interface ReconnectBackoffOptions {
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly jitterRatio: number;
  readonly retryCount: number;
}

/**
 * "Do NOT reconnect aggressively" (Part 6): exponential backoff with jitter,
 * capped, with a hard retry ceiling. Self-contained rather than imported from
 * Market Data or Order Queue's own copies of the same formula — each module
 * owns its own copy of this small, stable, pure utility rather than
 * introducing a cross-module dependency for it.
 */
export const ReconnectBackoffPolicy = {
  /** attempt is 1-indexed: the first retry is attempt 1. */
  computeDelayMs(
    attempt: number,
    options: ReconnectBackoffOptions,
    randomSource: () => number = Math.random,
  ): number {
    const exponential = Math.min(
      options.maxDelayMs,
      options.baseDelayMs * 2 ** (attempt - 1),
    );
    const jitter = exponential * options.jitterRatio * randomSource();
    return Math.round(Math.min(options.maxDelayMs, exponential + jitter));
  },

  hasExceededRetryCount(
    attempt: number,
    options: ReconnectBackoffOptions,
  ): boolean {
    return attempt > options.retryCount;
  },
};
