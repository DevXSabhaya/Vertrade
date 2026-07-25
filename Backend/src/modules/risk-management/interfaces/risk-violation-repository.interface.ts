import type { RiskViolation } from '../models/risk-violation.model';

export interface IRiskViolationRepository {
  save(violation: RiskViolation): Promise<void>;
  findRecent(limit: number): Promise<RiskViolation[]>;
}
