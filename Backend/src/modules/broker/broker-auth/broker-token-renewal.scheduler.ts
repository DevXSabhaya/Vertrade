import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@core/config/config.service';
import { TIMER_SCHEDULER } from '@shared/scheduler/timer-scheduler.constants';
import type { ITimerScheduler } from '@shared/scheduler/timer-scheduler.interface';
import { BrokerSessionManager } from './broker-session-manager';

/**
 * Proactively renews every currently-active broker session well inside its
 * 24h lifetime, so `POST /RenewToken` is always called against a
 * still-active token (per DhanHQ's documented constraint — see
 * DhanBrokerAuth). Runs continuously from process start (trading mode is
 * per-user now, so there is no single global "entering/leaving LIVE" moment
 * to gate a start/stop on) — each tick iterates
 * `BrokerSessionManager.getAllActiveAccountIds()` and refreshes each
 * independently: one account's refresh failure is logged and skipped,
 * never affecting any other account's renewal.
 */
@Injectable()
export class BrokerTokenRenewalScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(BrokerTokenRenewalScheduler.name);
  private handle: unknown = null;

  constructor(
    private readonly sessionManager: BrokerSessionManager,
    private readonly configService: ConfigService,
    @Inject(TIMER_SCHEDULER) private readonly scheduler: ITimerScheduler,
  ) {}

  onModuleInit(): void {
    this.start();
  }

  onModuleDestroy(): void {
    this.stop();
  }

  isRunning(): boolean {
    return this.handle !== null;
  }

  start(): void {
    if (this.handle !== null) {
      return;
    }
    this.handle = this.scheduler.setInterval(() => {
      void this.renewAllPossible();
    }, this.configService.brokerTokenRenewalIntervalMs);
  }

  stop(): void {
    if (this.handle !== null) {
      this.scheduler.clearInterval(this.handle);
      this.handle = null;
    }
  }

  private async renewAllPossible(): Promise<void> {
    const accountIds = this.sessionManager.getAllActiveAccountIds();
    await Promise.all(accountIds.map((accountId) => this.renewOne(accountId)));
  }

  private async renewOne(accountId: string): Promise<void> {
    try {
      await this.sessionManager.refresh(accountId);
    } catch (error) {
      this.logger.warn(
        `Proactive broker token renewal failed for account ${accountId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
