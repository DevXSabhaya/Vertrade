/** Why a trade's position was closed — recorded on the TradeExtension so it survives after the trade reaches a terminal state. */
export enum ExitReason {
  STOPLOSS = 'STOPLOSS',
  TARGET = 'TARGET',
  MANUAL = 'MANUAL',
  FORCE = 'FORCE',
  MARKET_CLOSE = 'MARKET_CLOSE',
  BROKER_DISCONNECT = 'BROKER_DISCONNECT',
  EMERGENCY = 'EMERGENCY',
}
