import type { TradeDirection } from './trade-direction.enum';
import type { TradingMode } from './trading-mode.type';

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
  /**
   * Captured once by the caller (`QueueWorker`, from `TradingModeService`'s
   * *current* mode for the trade's owning user) at the exact moment this
   * trade is created — never re-evaluated afterward. This is what pins the
   * trade to one executor for its entire lifecycle; see
   * `TradingEngineService.executorFor`.
   */
  readonly mode: TradingMode;
  /**
   * The specific `BrokerAccount.accountId` this trade executes through —
   * `null` for PAPER (no broker account involved at all), always a real,
   * owned account id for LIVE. Captured once alongside `mode`, from the
   * same per-user `TradingModeService` preference, and never re-evaluated —
   * an in-flight trade keeps using the same account for its whole lifecycle
   * even if the owning user later switches their selected broker.
   */
  readonly brokerAccountId: string | null;
}
