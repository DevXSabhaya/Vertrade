import type { MarketDataConnectionState } from './market-data-connection-state.enum';
import type { MarketDataProviderType } from './market-data-provider-type.enum';

/**
 * Consumed later by the Broker Health Monitor (a later phase) — Market Data
 * only needs to expose this snapshot, never push it anywhere itself.
 */
export interface MarketDataHealth {
  readonly providerType: MarketDataProviderType;
  readonly state: MarketDataConnectionState;
  readonly connected: boolean;
  readonly latencyMs: number | null;
  readonly heartbeatAgeMs: number | null;
  readonly subscriptionsCount: number;
}
