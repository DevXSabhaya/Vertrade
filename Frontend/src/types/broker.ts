export type BrokerId =
  | 'DHAN'
  | 'ANGEL_ONE'
  | 'UPSTOX'
  | 'ZERODHA'
  | 'SHOONYA'
  | 'FYERS'
  | 'ALICE_BLUE'
  | 'FIVE_PAISA'

export type BrokerCapability = 'EQUITY' | 'FNO' | 'COMMODITY' | 'CURRENCY' | 'MARKET_DATA' | 'OPTION_CHAIN'

export type BrokerRuntimeStatus =
  | 'NOT_CONNECTED'
  | 'CONNECTED'
  | 'REAUTH_REQUIRED'
  | 'ERROR'
  | 'NOT_IMPLEMENTED'

export interface BrokerFeatureFlags {
  readonly supportsBracketOrders: boolean
  readonly supportsGtt: boolean
  readonly supportsOptionChain: boolean
  readonly supportsMarketData: boolean
}

/** Static catalog entry — GET /brokers. Mirrors the backend's BrokerMetadata. */
export interface BrokerMetadata {
  readonly id: BrokerId
  readonly displayName: string
  readonly capabilities: readonly BrokerCapability[]
  readonly featureFlags: BrokerFeatureFlags
  readonly isImplemented: boolean
}

/** A saved broker account — mirrors the backend's BrokerAccount + runtimeStatus. */
export interface BrokerAccount {
  readonly accountId: string
  readonly userId: string
  readonly brokerId: BrokerId
  readonly displayName: string
  readonly isActive: boolean
  readonly createdAt: string
  readonly updatedAt: string
  readonly lastConnectedAt: string | null
  readonly lastError: string | null
  readonly runtimeStatus: BrokerRuntimeStatus
}

export interface AddBrokerAccountRequest {
  readonly brokerId: BrokerId
  readonly displayName: string
  readonly clientId: string
  readonly accessToken: string
}
