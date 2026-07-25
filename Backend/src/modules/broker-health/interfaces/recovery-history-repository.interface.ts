import type { RecoveryAttemptRecord } from '../models/recovery-attempt-record.model';

export interface IRecoveryHistoryRepository {
  save(record: RecoveryAttemptRecord): Promise<void>;
  findRecent(limit: number): Promise<RecoveryAttemptRecord[]>;
}
