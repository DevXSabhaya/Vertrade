import type { TradeDirection } from './trade-direction.enum';

/**
 * Everything the Engine needs to open a Trade — the instrument identity
 * (exchange/tradingSymbol/instrumentToken) is assumed already resolved by the
 * Instrument Resolver Service (a separate module, Phase 3); the Engine never
 * parses a raw user-typed symbol itself.
 */
export interface CreateTradeParams {
  readonly direction: TradeDirection;
  readonly exchange: string;
  readonly tradingSymbol: string;
  readonly instrumentToken: string;
  readonly quantity: number;
  readonly entryTriggerPrice: number;
  readonly initialStopLoss: number;
  readonly targets: readonly number[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}
