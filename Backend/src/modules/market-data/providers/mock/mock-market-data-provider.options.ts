export interface MockMarketDataProviderOptions {
  /** How often (ms) a live tick is generated for every subscribed instrument. */
  readonly tickIntervalMs: number;
  /** Fractional max move per tick, e.g. 0.001 = up to 0.1% per tick. */
  readonly volatility: number;
  /**
   * When true, no timers are started at all — connect()/subscribe() just
   * track state, and tests drive ticks/heartbeats explicitly via
   * emitDeterministicTick()/emitDeterministicHeartbeat(). No randomness, no
   * timers: fully reproducible, exactly like PaperExecutor's queueNextFill.
   */
  readonly deterministic: boolean;
  readonly heartbeatIntervalMs: number;
  /** Starting price per instrument token; defaults to 100 if unspecified. */
  readonly basePrices?: Readonly<Record<string, number>>;
}

export const DEFAULT_MOCK_PROVIDER_OPTIONS: MockMarketDataProviderOptions = {
  tickIntervalMs: 1_000,
  volatility: 0.001,
  deterministic: false,
  heartbeatIntervalMs: 5_000,
};
