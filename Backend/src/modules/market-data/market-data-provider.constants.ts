export const MOCK_MARKET_DATA_PROVIDER = Symbol('MOCK_MARKET_DATA_PROVIDER');
export const DHAN_MARKET_DATA_PROVIDER = Symbol('DHAN_MARKET_DATA_PROVIDER');

/**
 * The single provider MarketDataService actually depends on
 * (`IMarketDataProvider`) — selected once, at module-wiring time, from
 * `ConfigService.marketDataProvider`. Selection is never driven by
 * TradingModeService: Market Data is completely independent of Trading Mode,
 * so Paper and Live always observe the exact same feed.
 */
export const PRIMARY_MARKET_DATA_PROVIDER = Symbol(
  'PRIMARY_MARKET_DATA_PROVIDER',
);

/** Reports which concrete provider PRIMARY_MARKET_DATA_PROVIDER resolved to, for health/diagnostics display only — never used for branching logic. */
export const MARKET_DATA_PROVIDER_TYPE = Symbol('MARKET_DATA_PROVIDER_TYPE');

export const MARKET_DATA_RECONNECT_OPTIONS = Symbol(
  'MARKET_DATA_RECONNECT_OPTIONS',
);
