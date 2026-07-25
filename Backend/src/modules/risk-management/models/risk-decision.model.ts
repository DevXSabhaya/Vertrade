import type { RiskReasonCode } from './risk-reason-code.enum';
import type { RiskSnapshot } from './risk-snapshot.model';

/** Part 14 of the spec — the structured outcome of one risk evaluation. */
export interface RiskDecision {
  readonly allowed: boolean;
  readonly reasonCode: RiskReasonCode | null;
  readonly message: string;
  readonly evaluatedAt: string;
  readonly riskSnapshot: RiskSnapshot;
}
