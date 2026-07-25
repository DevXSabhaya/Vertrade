/**
 * ACTIVE: normal operation — the kill switch is not engaged, trading proceeds.
 * TRADING_DISABLED: new trade entries are blocked; existing positions are untouched.
 * EMERGENCY_STOP: the most severe state — new entries blocked, and (per policy) open positions are force-exited.
 */
export enum KillSwitchStatus {
  ACTIVE = 'ACTIVE',
  TRADING_DISABLED = 'TRADING_DISABLED',
  EMERGENCY_STOP = 'EMERGENCY_STOP',
}
