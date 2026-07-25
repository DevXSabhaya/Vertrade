import { KillSwitchStatus } from './kill-switch-status.enum';
import type { CircuitBreakerSnapshot } from './circuit-breaker.model';
import type { CooldownState } from './cooldown.model';

/** Part 15 of the spec — the full portfolio-level risk picture at a point in time. */
export interface RiskSnapshot {
  readonly asOf: string;
  readonly dailyRealizedPnl: number;
  readonly dailyUnrealizedPnl: number;
  readonly totalPnl: number;
  readonly openTradeCount: number;
  readonly openPositionCount: number;
  readonly totalExposure: number;
  readonly availableCapital: number;
  readonly usedCapital: number;
  readonly currentRisk: number;
  readonly consecutiveLosses: number;
  readonly cooldown: CooldownState | null;
  readonly killSwitchStatus: KillSwitchStatus;
  readonly emergencyStopActive: boolean;
  readonly circuitBreakers: readonly CircuitBreakerSnapshot[];
}
