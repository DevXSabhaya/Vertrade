import type { RepairAction } from '../models/repair-action.model';

export interface IRepairActionRepository {
  save(action: RepairAction): Promise<void>;
  findRecent(limit: number): Promise<RepairAction[]>;
}
