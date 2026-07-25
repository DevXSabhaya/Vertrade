import type { KillSwitchStatus } from './kill-switch-status.enum';
import type { CircuitBreakerSnapshot } from './circuit-breaker.model';

/** The compact view `GET /risk/status` returns — "is the system currently able to trade, and if not, why" — as opposed to `GET /risk/snapshot`'s full portfolio figures. */
export interface RiskStatus {
  readonly killSwitchStatus: KillSwitchStatus;
  readonly emergencyStopActive: boolean;
  readonly cooldownActive: boolean;
  readonly circuitBreakers: readonly CircuitBreakerSnapshot[];
  readonly tradingBlocked: boolean;
  readonly asOf: string;
}
