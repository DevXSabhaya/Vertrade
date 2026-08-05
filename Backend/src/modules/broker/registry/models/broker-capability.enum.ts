/** What a broker's implementation actually supports — drives which UI affordances/trade paths are offered for a given broker. */
export enum BrokerCapability {
  EQUITY = 'EQUITY',
  FNO = 'FNO',
  COMMODITY = 'COMMODITY',
  CURRENCY = 'CURRENCY',
  MARKET_DATA = 'MARKET_DATA',
  OPTION_CHAIN = 'OPTION_CHAIN',
}
