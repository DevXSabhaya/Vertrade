import { Inject, Injectable } from '@nestjs/common';
import { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import { MarketDataService } from '@modules/market-data/market-data.service';
import { InstrumentMasterService } from '@modules/instrument-master/instrument-master.service';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { RECOVERY_HISTORY_REPOSITORY } from '../broker-health.constants';
import type { IRecoveryHistoryRepository } from '../interfaces/recovery-history-repository.interface';
import { BrokerHealthMetricsService } from '../metrics/broker-health-metrics.service';

/**
 * Automatic recovery, scoped strictly to infrastructure reconnection:
 * WebSocket, broker session, and instrument cache. This class never imports
 * TradingEngineService or OrderQueueService — recovery must never submit a
 * duplicate order and must never touch Trading Engine state, so the only way
 * to guarantee that is to never give this class the means to do either.
 */
@Injectable()
export class RecoveryManagerService {
  constructor(
    private readonly marketDataService: MarketDataService,
    private readonly sessionManager: BrokerSessionManager,
    private readonly instrumentMasterService: InstrumentMasterService,
    private readonly metrics: BrokerHealthMetricsService,
    @Inject(RECOVERY_HISTORY_REPOSITORY)
    private readonly recoveryHistoryRepository: IRecoveryHistoryRepository,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async recover(reason: string): Promise<void> {
    this.metrics.recordRecoveryAttempt();
    const startedAt = this.clock.now();

    try {
      await this.reconnectMarketData();
      await this.ensureValidSession();
      await this.instrumentMasterService.refresh();

      await this.recoveryHistoryRepository.save({
        reason,
        startedAt: startedAt.toISOString(),
        finishedAt: this.clock.now().toISOString(),
        succeeded: true,
        error: null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown recovery failure';
      await this.recoveryHistoryRepository.save({
        reason,
        startedAt: startedAt.toISOString(),
        finishedAt: this.clock.now().toISOString(),
        succeeded: false,
        error: message,
      });
      throw error;
    }
  }

  private async reconnectMarketData(): Promise<void> {
    await this.marketDataService.stop();
    await this.marketDataService.start();
  }

  /**
   * Best-effort, per-account: refreshes every session currently loaded in
   * memory (`getAllActiveAccountIds()`), independently. Unlike the old
   * single-session model, this never falls back to a fresh credential-based
   * login — that requires knowing which `BrokerAccount`'s credentials to
   * use, which belongs to `BrokerAccountService.reconnect()`/the token
   * renewal scheduler's bootstrap flow, not this infra-level
   * websocket/session-refresh recovery. A session lost entirely (not just
   * expired) is picked back up the next time its owning user's trading
   * activity calls `ensureSession(accountId)`.
   */
  private async ensureValidSession(): Promise<void> {
    const accountIds = this.sessionManager.getAllActiveAccountIds();
    await Promise.all(
      accountIds.map((accountId) =>
        this.sessionManager.refresh(accountId).catch(() => undefined),
      ),
    );
  }
}
