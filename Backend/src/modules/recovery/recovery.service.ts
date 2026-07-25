import { Inject, Injectable } from '@nestjs/common';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { RecoveryCoordinator } from './recovery-coordinator.service';
import { RecoverySnapshotService } from './recovery-snapshot.service';
import { RECOVERY_HISTORY_REPOSITORY } from './recovery.constants';
import type { IRecoveryHistoryRepository } from './interfaces/recovery-history-repository.interface';
import type { RecoveryHistoryEntry } from './models/recovery-history-entry.model';
import type { RecoverySnapshot } from './models/recovery-snapshot.model';
import type { RecoveryStatus } from './models/recovery-status.model';

/**
 * The façade RecoveryController (and, indirectly, anything else in-process
 * that needs recovery state) talks to — keeps HTTP concerns out of
 * RecoveryCoordinator itself.
 */
@Injectable()
export class RecoveryService {
  private lastStartedAt: string | null = null;
  private lastCompletedAt: string | null = null;
  private lastError: string | null = null;

  constructor(
    private readonly coordinator: RecoveryCoordinator,
    private readonly snapshotService: RecoverySnapshotService,
    @Inject(RECOVERY_HISTORY_REPOSITORY)
    private readonly historyRepository: IRecoveryHistoryRepository,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async start(): Promise<RecoveryHistoryEntry> {
    this.lastStartedAt = this.clock.now().toISOString();
    const result = await this.coordinator.run({ resume: false });
    this.recordResult(result);
    return result;
  }

  async restart(): Promise<RecoveryHistoryEntry> {
    this.lastStartedAt = this.clock.now().toISOString();
    const result = await this.coordinator.run({ resume: true });
    this.recordResult(result);
    return result;
  }

  getStatus(): RecoveryStatus {
    return {
      state: this.coordinator.currentState(),
      currentStep: null,
      isRunning: this.coordinator.isRunning(),
      startedAt: this.lastStartedAt,
      lastCompletedAt: this.lastCompletedAt,
      lastError: this.lastError,
    };
  }

  async getHistory(limit = 20): Promise<RecoveryHistoryEntry[]> {
    return this.historyRepository.findRecent(limit);
  }

  async getLatestSnapshot(): Promise<RecoverySnapshot | null> {
    return this.snapshotService.loadLatestSnapshot();
  }

  private recordResult(result: RecoveryHistoryEntry): void {
    this.lastCompletedAt = result.completedAt;
    this.lastError = result.succeeded ? null : result.failureReason;
  }
}
