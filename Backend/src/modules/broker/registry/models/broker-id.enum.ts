/**
 * Every broker this platform can support, whether or not it has a real
 * adapter yet. Adding a broker's real IBrokerAuth/IOrderExecutor
 * implementation later never means changing this enum's consumers — the
 * registry/factory only ever look brokers up by this id.
 */
export enum BrokerId {
  DHAN = 'DHAN',
  ANGEL_ONE = 'ANGEL_ONE',
  UPSTOX = 'UPSTOX',
  ZERODHA = 'ZERODHA',
  SHOONYA = 'SHOONYA',
  FYERS = 'FYERS',
  ALICE_BLUE = 'ALICE_BLUE',
  FIVE_PAISA = 'FIVE_PAISA',
}
