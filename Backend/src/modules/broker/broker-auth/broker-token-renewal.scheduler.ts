import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@core/config/config.service';
import { TIMER_SCHEDULER } from '@shared/scheduler/timer-scheduler.constants';
import type { ITimerScheduler } from '@shared/scheduler/timer-scheduler.interface';
import { BrokerSessionManager } from './broker-session-manager';

/**
 * Proactively renews the active broker session well inside its 24h
 * lifetime, so `POST /RenewToken` is always called against a still-active
 * token (per DhanHQ's documented constraint — see DhanBrokerAuth). Its
 * own timer is started/stopped by TradingModeService's atomic commit step
 * (entering/leaving LIVE), not self-gated by an always-on interval —
 * this is what makes "nothing from the previous mode continues running"
 * literally true for this scheduler, not just logically true.
 */
@Injectable()
export class BrokerTokenRenewalScheduler {
  private readonly logger = new Logger(BrokerTokenRenewalScheduler.name);
  private handle: unknown = null;

  constructor(
    private readonly sessionManager: BrokerSessionManager,
    private readonly configService: ConfigService,
    @Inject(TIMER_SCHEDULER) private readonly scheduler: ITimerScheduler,
  ) {}

  isRunning(): boolean {
    return this.handle !== null;
  }

  start(): void {
    if (this.handle !== null) {
      return;
    }
    this.handle = this.scheduler.setInterval(() => {
      void this.renewIfPossible();
    }, this.configService.brokerTokenRenewalIntervalMs);
  }

  stop(): void {
    if (this.handle !== null) {
      this.scheduler.clearInterval(this.handle);
      this.handle = null;
    }
  }

  private async renewIfPossible(): Promise<void> {
    if (this.sessionManager.getActiveSession() === null) {
      return;
    }
    try {
      await this.sessionManager.refresh();
    } catch (error) {
      this.logger.warn(
        `Proactive broker token renewal failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
