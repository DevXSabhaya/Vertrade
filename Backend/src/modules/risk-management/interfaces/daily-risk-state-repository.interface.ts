import type { DailyRiskState } from '../models/daily-risk-state.model';

export interface IDailyRiskStateRepository {
  save(state: DailyRiskState): Promise<void>;
  find(tradeDate: string): Promise<DailyRiskState | null>;
}
