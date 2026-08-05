/**
 * Per-broker-account connection status. Mirrors `BrokerSessionManager`'s
 * existing `BrokerAuthState` ('AUTHENTICATED'/'DISCONNECTED'/'REAUTH_REQUIRED')
 * but scoped to one of potentially several saved broker accounts, plus an
 * explicit NOT_IMPLEMENTED for brokers that only have a registry entry and a
 * placeholder adapter so far.
 */
export enum BrokerStatus {
  NOT_CONNECTED = 'NOT_CONNECTED',
  CONNECTED = 'CONNECTED',
  REAUTH_REQUIRED = 'REAUTH_REQUIRED',
  ERROR = 'ERROR',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
}
