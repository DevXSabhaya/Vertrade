import type { IRecoveryErrorRepository } from '../interfaces/recovery-error-repository.interface';
import type { RecoveryErrorRecord } from '../models/recovery-error-record.model';

export class FakeRecoveryErrorRepository implements IRecoveryErrorRepository {
  private readonly records: RecoveryErrorRecord[] = [];

  save(record: RecoveryErrorRecord): Promise<void> {
    this.records.push(record);
    return Promise.resolve();
  }

  findRecent(limit: number): Promise<RecoveryErrorRecord[]> {
    return Promise.resolve([...this.records].reverse().slice(0, limit));
  }

  all(): readonly RecoveryErrorRecord[] {
    return this.records;
  }
}
