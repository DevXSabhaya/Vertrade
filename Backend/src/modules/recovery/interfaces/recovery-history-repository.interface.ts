import type { RecoveryHistoryEntry } from '../models/recovery-history-entry.model';

export interface IRecoveryHistoryRepository {
  save(entry: RecoveryHistoryEntry): Promise<void>;
  findRecent(limit: number): Promise<RecoveryHistoryEntry[]>;
  findLastSuccessful(): Promise<RecoveryHistoryEntry | null>;
  /** The most recent run that started but never reached a terminal state — used to support resumability. */
  findLastIncomplete(): Promise<RecoveryHistoryEntry | null>;
}
