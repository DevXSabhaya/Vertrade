import type { IRecoveryHistoryRepository } from '../interfaces/recovery-history-repository.interface';
import type { RecoveryHistoryEntry } from '../models/recovery-history-entry.model';

export class FakeRecoveryHistoryRepository implements IRecoveryHistoryRepository {
  private readonly byId = new Map<string, RecoveryHistoryEntry>();

  save(entry: RecoveryHistoryEntry): Promise<void> {
    this.byId.set(entry.id, entry);
    return Promise.resolve();
  }

  findRecent(limit: number): Promise<RecoveryHistoryEntry[]> {
    return Promise.resolve(
      Array.from(this.byId.values())
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .slice(0, limit),
    );
  }

  findLastSuccessful(): Promise<RecoveryHistoryEntry | null> {
    const successful = Array.from(this.byId.values())
      .filter((e) => e.succeeded === true)
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
    return Promise.resolve(successful[0] ?? null);
  }

  findLastIncomplete(): Promise<RecoveryHistoryEntry | null> {
    const incomplete = Array.from(this.byId.values())
      .filter((e) => e.succeeded === null)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return Promise.resolve(incomplete[0] ?? null);
  }

  seed(entry: RecoveryHistoryEntry): void {
    this.byId.set(entry.id, entry);
  }
}
