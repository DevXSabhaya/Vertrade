import type { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';

/**
 * Everything a caller (a future REST endpoint, Telegram import, etc.) submits
 * to start a trade — before the raw symbol has been resolved and before any
 * business rule has run. `idempotencyKey` is optional: the caller (the
 * frontend's "Start Trade" button) should generate one UUID per user action
 * and resend the same value on any retry of that action; if omitted, the
 * Order Queue derives one from the request contents plus a coarse time
 * window instead (see IdempotencyKeyGenerator).
 */
export interface TradeValidationRequest {
  readonly rawSymbol: string;
  readonly direction: TradeDirection;
  readonly quantity: number;
  readonly entryTriggerPrice: number;
  readonly initialStopLoss: number;
  readonly targets: readonly number[];
  readonly idempotencyKey?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
