import type { RiskEventRecord } from '../models/risk-event-record.model';

export interface IRiskEventRepository {
  save(record: RiskEventRecord): Promise<void>;
  findRecent(limit: number): Promise<RiskEventRecord[]>;
}
