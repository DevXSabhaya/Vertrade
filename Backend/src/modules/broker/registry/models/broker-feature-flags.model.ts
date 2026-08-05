/** Per-broker product-feature support, used to gate UI affordances (e.g. don't show a bracket-order toggle for a broker that doesn't support it). */
export interface BrokerFeatureFlags {
  readonly supportsBracketOrders: boolean;
  readonly supportsGtt: boolean;
  readonly supportsOptionChain: boolean;
  readonly supportsMarketData: boolean;
}

export const NO_FEATURE_FLAGS: BrokerFeatureFlags = {
  supportsBracketOrders: false,
  supportsGtt: false,
  supportsOptionChain: false,
  supportsMarketData: false,
};
