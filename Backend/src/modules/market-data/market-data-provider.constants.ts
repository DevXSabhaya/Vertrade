/** @deprecated No longer wired to any DI factory — kept only for source compatibility. Provider selection now comes exclusively from TradingModeService via MarketDataService.initializeForMode/prepareProviderForMode/commitProviderSwitch. */
export const MARKET_DATA_PROVIDER = Symbol('MARKET_DATA_PROVIDER');
export const MOCK_MARKET_DATA_PROVIDER = Symbol('MOCK_MARKET_DATA_PROVIDER');
export const DHAN_MARKET_DATA_PROVIDER = Symbol('DHAN_MARKET_DATA_PROVIDER');
export const MARKET_DATA_RECONNECT_OPTIONS = Symbol(
  'MARKET_DATA_RECONNECT_OPTIONS',
);
