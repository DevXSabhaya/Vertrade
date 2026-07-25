import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { TIMER_SCHEDULER } from '@shared/scheduler/timer-scheduler.constants';
import type { ITimerScheduler } from '@shared/scheduler/timer-scheduler.interface';
import { PositionReconciliationService } from '@modules/position-reconciliation/position-reconciliation.service';
import { RECOVERY_CONFIG } from './recovery.constants';
import type { RecoveryConfig } from './models/recovery-config.model';

/**
 * Periodic re-verification once boot recovery has completed — Position
 * Reconciliation is not a one-shot startup check, it needs to keep catching
 * drift for as long as the process runs (Section 14 of the frozen
 * architecture: "periodic diff of broker-reported positions vs local Engine
 * state"). Deliberately never started from its own constructor/onModuleInit
 * — RecoveryBootstrapService starts it only after a successful recovery run,
 * mirroring the "never auto-start network/background work at boot" rule
 * every other module in this codebase follows.
 */
@Injectable()
export class RecoveryScheduler implements OnModuleDestroy {
  private intervalHandle: unknown = null;

  constructor(
    private readonly positionReconciliationService: PositionReconciliationService,
    @Inject(TIMER_SCHEDULER) private readonly scheduler: ITimerScheduler,
    @Inject(RECOVERY_CONFIG) private readonly config: RecoveryConfig,
  ) {}

  start(): void {
    if (this.intervalHandle !== null) {
      return;
    }
    this.intervalHandle = this.scheduler.setInterval(() => {
      void this.positionReconciliationService.reconcile();
    }, this.config.reconciliationIntervalMs);
  }

  stop(): void {
    if (this.intervalHandle !== null) {
      this.scheduler.clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  isRunning(): boolean {
    return this.intervalHandle !== null;
  }

  onModuleDestroy(): void {
    this.stop();
  }
}
