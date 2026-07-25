import type { IRecoverySnapshotRepository } from '../interfaces/recovery-snapshot-repository.interface';
import type { RecoverySnapshot } from '../models/recovery-snapshot.model';

export class FakeRecoverySnapshotRepository implements IRecoverySnapshotRepository {
  private readonly byId = new Map<string, RecoverySnapshot>();

  save(snapshot: RecoverySnapshot): Promise<void> {
    this.byId.set(snapshot.id, snapshot);
    return Promise.resolve();
  }

  findLatest(): Promise<RecoverySnapshot | null> {
    const all = Array.from(this.byId.values()).sort((a, b) =>
      b.capturedAt.localeCompare(a.capturedAt),
    );
    return Promise.resolve(all[0] ?? null);
  }

  seed(snapshot: RecoverySnapshot): void {
    this.byId.set(snapshot.id, snapshot);
  }
}
