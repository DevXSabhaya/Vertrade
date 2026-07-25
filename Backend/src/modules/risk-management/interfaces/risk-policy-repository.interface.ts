import type { RiskPolicy } from '../models/risk-policy.model';

export interface IRiskPolicyRepository {
  save(policy: RiskPolicy): Promise<void>;
  find(): Promise<RiskPolicy | null>;
}
