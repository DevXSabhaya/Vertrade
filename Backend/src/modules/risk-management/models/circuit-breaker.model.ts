export enum CircuitBreakerStatus {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

/** One named circuit per external dependency this system's risk gate cares about. */
export enum CircuitBreakerName {
  BROKER = 'BROKER',
  MARKET_DATA = 'MARKET_DATA',
  ORDER_EXECUTION = 'ORDER_EXECUTION',
}

export interface CircuitBreakerSnapshot {
  readonly name: CircuitBreakerName;
  readonly status: CircuitBreakerStatus;
  readonly consecutiveFailures: number;
  readonly openedAt: string | null;
  readonly lastFailureAt: string | null;
  readonly lastSuccessAt: string | null;
}
