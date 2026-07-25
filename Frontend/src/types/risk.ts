export type KillSwitchStatus = 'ACTIVE' | 'TRADING_DISABLED' | 'EMERGENCY_STOP'

export type CircuitBreakerStatus = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export type CircuitBreakerName = 'BROKER' | 'MARKET_DATA' | 'ORDER_EXECUTION'

export interface CircuitBreakerSnapshot {
  readonly name: CircuitBreakerName
  readonly status: CircuitBreakerStatus
  readonly consecutiveFailures: number
  readonly openedAt: string | null
  readonly lastFailureAt: string | null
  readonly lastSuccessAt: string | null
}

export interface RiskStatus {
  readonly killSwitchStatus: KillSwitchStatus
  readonly emergencyStopActive: boolean
  readonly cooldownActive: boolean
  readonly circuitBreakers: readonly CircuitBreakerSnapshot[]
  readonly tradingBlocked: boolean
  readonly asOf: string
}

export interface RiskSnapshot {
  readonly asOf: string
  readonly dailyRealizedPnl: number
  readonly dailyUnrealizedPnl: number
  readonly totalPnl: number
  readonly openTradeCount: number
  readonly openPositionCount: number
  readonly totalExposure: number
  readonly availableCapital: number
  readonly usedCapital: number
  readonly currentRisk: number
  readonly consecutiveLosses: number
  readonly killSwitchStatus: KillSwitchStatus
  readonly emergencyStopActive: boolean
  readonly circuitBreakers: readonly CircuitBreakerSnapshot[]
}
