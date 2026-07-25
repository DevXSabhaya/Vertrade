import type { Tick } from '../models/tick.model';
import type { MarketDataInstrument } from '../models/market-data-instrument.model';
import type { MarketDataConnectionState } from '../models/market-data-connection-state.enum';

/**
 * The Trading Engine never sees this interface at all — MarketDataService is
 * the only consumer. Every future broker (Zerodha, Upstox, Fyers, Shoonya)
 * plugs in by implementing this interface; nothing else in the system
 * changes. Mirrors the IOrderExecutor pattern from Phase 4.
 */
export interface IMarketDataProvider {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(instruments: readonly MarketDataInstrument[]): Promise<void>;
  unsubscribe(instrumentTokens: readonly string[]): Promise<void>;
  reconnect(): Promise<void>;
  isConnected(): boolean;

  /** Registers the single handler that receives every normalized tick. */
  onTick(handler: (tick: Tick) => void): void;
  /** Registers the single handler invoked whenever a heartbeat is observed. */
  onHeartbeat(handler: () => void): void;
  /** Registers the single handler invoked whenever the connection state changes. */
  onConnectionStateChange(
    handler: (state: MarketDataConnectionState) => void,
  ): void;
}
