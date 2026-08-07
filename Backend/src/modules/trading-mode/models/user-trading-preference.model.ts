import type { TradingMode } from '@modules/trade-lifecycle/models/trade-record.model';

/**
 * One row per user — mirrors how `BrokerAccount` is already a per-user row
 * rather than a global table (see `BrokerAccountService`). Trading mode is
 * no longer a single deployment-wide toggle: each user independently
 * chooses Paper or Live, and, when Live, which of their own connected
 * `BrokerAccount`s executes their trades. `selectedBrokerAccountId` is
 * always `null` in PAPER (paper trading has no broker account) and always
 * set in LIVE (enforced by `TradingModeService.setMode`).
 */
export interface UserTradingPreference {
  readonly userId: string;
  readonly tradingMode: TradingMode;
  readonly selectedBrokerAccountId: string | null;
  readonly updatedAt: Date;
}
