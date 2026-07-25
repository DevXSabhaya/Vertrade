import { createHash } from 'node:crypto';

export interface IdempotencyKeyInput {
  /** Caller-supplied key (e.g. a UUID the frontend generates once per click
   * and resends on every retry of that same click). Always preferred when
   * present — it is the only mechanism that can dedupe requests seconds or
   * minutes apart, not just within a short window. */
  readonly explicitKey?: string;
  readonly instrumentToken: string;
  readonly orderType: string;
  readonly direction: string;
  readonly quantity: number;
  readonly entryTriggerPrice: number;
  readonly now: Date;
}

const DEFAULT_DEDUP_WINDOW_MS = 3_000;

/**
 * Exactly-once execution starts here. When the caller supplies its own key,
 * that key alone determines identity. Otherwise a key is derived from the
 * trade's own shape (instrument, order type, direction, quantity, entry
 * price) plus a coarse time bucket — wide enough to absorb a double-click, a
 * duplicate WebSocket message, or a same-instant network retry, without
 * merging two genuinely separate trades placed minutes apart.
 */
export const IdempotencyKeyGenerator = {
  generate(
    input: IdempotencyKeyInput,
    windowMs: number = DEFAULT_DEDUP_WINDOW_MS,
  ): string {
    if (input.explicitKey && input.explicitKey.trim().length > 0) {
      return `explicit:${input.explicitKey.trim()}`;
    }

    const bucket = Math.floor(input.now.getTime() / windowMs);
    const raw = [
      input.instrumentToken,
      input.orderType,
      input.direction,
      input.quantity,
      input.entryTriggerPrice,
      bucket,
    ].join(':');

    return `derived:${createHash('sha256').update(raw).digest('hex')}`;
  },
};
