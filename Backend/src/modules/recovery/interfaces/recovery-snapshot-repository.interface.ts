import type { RecoverySnapshot } from '../models/recovery-snapshot.model';

export interface IRecoverySnapshotRepository {
  save(snapshot: RecoverySnapshot): Promise<void>;
  findLatest(): Promise<RecoverySnapshot | null>;
}
