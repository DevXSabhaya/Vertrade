import {
  IllegalTradeStateTransitionException,
  InvalidTradeDefinitionException,
} from '@modules/trading-engine/exceptions';
import type { RetryOptions } from '../models/retry-options.model';

/**
 * Exponential backoff with jitter, plus permanent-vs-transient failure
 * classification. Validation failures never reach this strategy at all —
 * they are rejected before ever being queued — so "permanent" here only
 * means a business-rule exception raised by the Trading Engine itself while
 * processing an already-validated item (e.g. a race against another queue
 * item that resolved first). Everything else (network blips, unexpected
 * broker/infrastructure errors) is treated as transient and retried.
 */
export const RetryStrategy = {
  /** attempt is 1-indexed: the first retry is attempt 1. */
  computeDelayMs(
    attempt: number,
    options: RetryOptions,
    randomSource: () => number = Math.random,
  ): number {
    const exponential = Math.min(
      options.maxDelayMs,
      options.baseDelayMs * 2 ** (attempt - 1),
    );
    const jitter = exponential * options.jitterRatio * randomSource();
    return Math.round(Math.min(options.maxDelayMs, exponential + jitter));
  },

  hasExceededMaxRetries(attempt: number, options: RetryOptions): boolean {
    return attempt > options.maxRetries;
  },

  isPermanentFailure(error: unknown): boolean {
    return (
      error instanceof InvalidTradeDefinitionException ||
      error instanceof IllegalTradeStateTransitionException
    );
  },

  isRetryableFailure(error: unknown): boolean {
    return !this.isPermanentFailure(error);
  },
};
