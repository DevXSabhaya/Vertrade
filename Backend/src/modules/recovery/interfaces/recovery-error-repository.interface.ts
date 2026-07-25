import type { RecoveryErrorRecord } from '../models/recovery-error-record.model';

export interface IRecoveryErrorRepository {
  save(record: RecoveryErrorRecord): Promise<void>;
  findRecent(limit: number): Promise<RecoveryErrorRecord[]>;
}
