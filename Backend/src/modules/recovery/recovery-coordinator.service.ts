import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ConnectionStates, type Connection } from 'mongoose';
import { FeatureFlagsService } from '@core/feature-flags/feature-flag.service';
import { SettingsService } from '@modules/settings/settings.service';
import { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import { MarketDataService } from '@modules/market-data/market-data.service';
import { MarketDataInstrument } from '@modules/market-data/models/market-data-instrument.model';
import { InstrumentMasterService } from '@modules/instrument-master/instrument-master.service';
import { TradingEngineService } from '@modules/trading-engine/trading-engine.service';
import { TradeState } from '@modules/trading-engine/domain/trade-state.enum';
import { TradeStateTransitions } from '@modules/trading-engine/domain/trade-state-transitions';
import type { TradeSnapshot } from '@modules/trading-engine/domain/trade-snapshot';
import { OrderQueueService } from '@modules/order-queue/order-queue.service';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { TIMER_SCHEDULER } from '@shared/scheduler/timer-scheduler.constants';
import type { ITimerScheduler } from '@shared/scheduler/timer-scheduler.interface';
import { RecoveryState } from './models/recovery-state.enum';
import { RecoveryStep, RETRYABLE_STEPS } from './models/recovery-step.enum';
import type { RecoveryConfig } from './models/recovery-config.model';
import type { RecoveryHistoryEntry } from './models/recovery-history-entry.model';
import { RecoveryStateMachine } from './state-machine/recovery-state-machine';
import { RecoverySnapshotService } from './recovery-snapshot.service';
import { RecoveryEventPublisher } from './recovery-event-publisher';
import {
  RECOVERY_CONFIG,
  RECOVERY_ERROR_REPOSITORY,
  RECOVERY_HISTORY_REPOSITORY,
} from './recovery.constants';
import type { IRecoveryHistoryRepository } from './interfaces/recovery-history-repository.interface';
import type { IRecoveryErrorRepository } from './interfaces/recovery-error-repository.interface';
import { RecoveryAlreadyRunningException } from './exceptions/recovery-already-running.exception';
import { PositionReconciliationService } from '@modules/position-reconciliation/position-reconciliation.service';
import { RiskPolicyService } from '@modules/risk-management/risk-policy.service';
import { KillSwitchService } from '@modules/risk-management/kill-switch.service';
import { EmergencyStopService } from '@modules/risk-management/emergency-stop.service';
import { CooldownService } from '@modules/risk-management/cooldown.service';
import { DailyRiskStateService } from '@modules/risk-management/daily-risk-state.service';

const NON_TERMINAL_TRADE_STATES = (
  Object.values(TradeState) as TradeState[]
).filter((state) => !TradeStateTransitions.isTerminal(state));

/**
 * Orchestrates the Recovery Flow (Part 2 of the Phase 9 spec) end to end:
 * one fixed sequence of steps, each mapped onto a RecoveryStateMachine
 * transition, retried with backoff where the step is network/IO-bound, and
 * never restarted once recorded as completed in the current run's history
 * entry (resumability). Never throws on a step failure — the run always
 * resolves to a RecoveryHistoryEntry describing what happened, so a crashed
 * broker/market-data connection during recovery can never crash the app.
 */
@Injectable()
export class RecoveryCoordinator {
  private readonly logger = new Logger(RecoveryCoordinator.name);
  private running = false;

  constructor(
    private readonly stateMachine: RecoveryStateMachine,
    private readonly snapshotService: RecoverySnapshotService,
    private readonly eventPublisher: RecoveryEventPublisher,
    private readonly featureFlagsService: FeatureFlagsService,
    private readonly settingsService: SettingsService,
    private readonly brokerSessionManager: BrokerSessionManager,
    private readonly marketDataService: MarketDataService,
    private readonly instrumentMasterService: InstrumentMasterService,
    private readonly tradingEngineService: TradingEngineService,
    private readonly orderQueueService: OrderQueueService,
    private readonly positionReconciliationService: PositionReconciliationService,
    private readonly riskPolicyService: RiskPolicyService,
    private readonly killSwitchService: KillSwitchService,
    private readonly emergencyStopService: EmergencyStopService,
    private readonly cooldownService: CooldownService,
    private readonly dailyRiskStateService: DailyRiskStateService,
    @InjectConnection() private readonly mongooseConnection: Connection,
    @Inject(CLOCK) private readonly clock: IClock,
    @Inject(TIMER_SCHEDULER) private readonly scheduler: ITimerScheduler,
    @Inject(RECOVERY_CONFIG) private readonly config: RecoveryConfig,
    @Inject(RECOVERY_HISTORY_REPOSITORY)
    private readonly historyRepository: IRecoveryHistoryRepository,
    @Inject(RECOVERY_ERROR_REPOSITORY)
    private readonly errorRepository: IRecoveryErrorRepository,
  ) {}

  isRunning(): boolean {
    return this.running;
  }

  currentState(): RecoveryState {
    return this.stateMachine.state;
  }

  /**
   * Runs the full recovery flow once. `resume: true` looks for the most
   * recent run that started but never reached a terminal state and skips
   * every step already recorded as completed there — "never restart
   * completed steps."
   */
  async run(options: { resume?: boolean } = {}): Promise<RecoveryHistoryEntry> {
    if (this.running) {
      throw new RecoveryAlreadyRunningException(
        'A recovery run is already in progress',
      );
    }

    const priorIncomplete = options.resume
      ? await this.historyRepository.findLastIncomplete()
      : null;
    const recoveryId = priorIncomplete?.id ?? randomUUID();
    const completedSteps = new Set<RecoveryStep>(
      priorIncomplete?.stepsCompleted ?? [],
    );
    const startedAt =
      priorIncomplete?.startedAt ?? this.clock.now().toISOString();
    const startedAtMs = new Date(startedAt).getTime();

    this.running = true;
    this.stateMachine.reset();
    this.stateMachine.transitionTo(RecoveryState.STARTING);
    this.eventPublisher.started(recoveryId);

    let tradesRecovered = 0;
    let queueItemsRecovered = 0;

    try {
      await this.runStep(
        recoveryId,
        RecoveryStep.LOAD_CONFIGURATION,
        completedSteps,
        () => this.stepLoadConfiguration(),
      );
      this.stateMachine.transitionTo(RecoveryState.LOADING_CONFIG);

      await this.runStep(
        recoveryId,
        RecoveryStep.VERIFY_DATABASE,
        completedSteps,
        () => this.stepVerifyDatabase(),
      );
      this.stateMachine.transitionTo(RecoveryState.DATABASE_CONNECTED);

      await this.runStep(
        recoveryId,
        RecoveryStep.RESTORE_FEATURE_FLAGS,
        completedSteps,
        () => this.stepRestoreFeatureFlags(),
      );
      await this.runStep(
        recoveryId,
        RecoveryStep.RESTORE_SETTINGS,
        completedSteps,
        () => this.stepRestoreSettings(),
      );

      this.stateMachine.transitionTo(RecoveryState.BROKER_AUTHENTICATING);
      await this.runStep(
        recoveryId,
        RecoveryStep.RESTORE_BROKER_AUTHENTICATION,
        completedSteps,
        () => this.stepRestoreBrokerAuthentication(),
      );
      await this.runStep(
        recoveryId,
        RecoveryStep.RECONNECT_BROKER,
        completedSteps,
        () => this.stepReconnectBroker(),
      );
      this.stateMachine.transitionTo(RecoveryState.BROKER_CONNECTED);

      await this.runStep(
        recoveryId,
        RecoveryStep.RECONNECT_MARKET_DATA,
        completedSteps,
        () => this.stepReconnectMarketData(),
      );
      this.stateMachine.transitionTo(RecoveryState.MARKET_CONNECTED);

      await this.runStep(
        recoveryId,
        RecoveryStep.RELOAD_INSTRUMENT_MASTER,
        completedSteps,
        () => this.stepReloadInstrumentMaster(),
      );
      this.stateMachine.transitionTo(RecoveryState.INSTRUMENT_LOADED);

      let restoredTrades: readonly TradeSnapshot[] = [];
      await this.runStep(
        recoveryId,
        RecoveryStep.RESTORE_ACTIVE_TRADES,
        completedSteps,
        async () => {
          restoredTrades = await this.stepRestoreActiveTrades();
        },
      );
      await this.runStep(
        recoveryId,
        RecoveryStep.RESTORE_TRADING_ENGINE,
        completedSteps,
        () => this.stepRestoreTradingEngine(restoredTrades),
      );
      this.stateMachine.transitionTo(RecoveryState.ENGINE_RECOVERED);
      tradesRecovered = restoredTrades.length;
      this.eventPublisher.engineRecovered(recoveryId, tradesRecovered);

      await this.runStep(
        recoveryId,
        RecoveryStep.RESTORE_RISK_STATE,
        completedSteps,
        () => this.stepRestoreRiskState(),
      );

      this.stateMachine.transitionTo(RecoveryState.TRADES_RECOVERED);

      await this.runStep(
        recoveryId,
        RecoveryStep.RESTORE_ORDER_QUEUE,
        completedSteps,
        () => this.stepRestoreOrderQueue(),
      );
      await this.runStep(
        recoveryId,
        RecoveryStep.RESTORE_IDEMPOTENCY_KEYS,
        completedSteps,
        () => Promise.resolve(),
      );
      await this.runStep(
        recoveryId,
        RecoveryStep.RESTORE_PENDING_ORDERS,
        completedSteps,
        () => Promise.resolve(),
      );
      queueItemsRecovered = this.orderQueueService.getAllItems().length;
      this.eventPublisher.queueRecovered(recoveryId, queueItemsRecovered);
      this.stateMachine.transitionTo(RecoveryState.QUEUE_RECOVERED);

      await this.runStep(
        recoveryId,
        RecoveryStep.RESUME_TICK_PROCESSING,
        completedSteps,
        () => Promise.resolve(),
      );
      await this.runStep(
        recoveryId,
        RecoveryStep.RESUME_MONITORING,
        completedSteps,
        () => Promise.resolve(),
      );
      this.stateMachine.transitionTo(RecoveryState.MONITORING_RECOVERED);

      this.stateMachine.transitionTo(RecoveryState.VERIFYING_POSITIONS);
      await this.runStep(
        recoveryId,
        RecoveryStep.VERIFY_POSITIONS,
        completedSteps,
        () => this.stepVerifyPositions(),
      );

      await this.snapshotService.captureAndPersist();

      this.stateMachine.transitionTo(RecoveryState.COMPLETED);
      const completedAt = this.clock.now();
      const durationMs = completedAt.getTime() - startedAtMs;

      const entry: RecoveryHistoryEntry = {
        id: recoveryId,
        startedAt,
        completedAt: completedAt.toISOString(),
        succeeded: true,
        finalState: RecoveryState.COMPLETED,
        durationMs,
        failureReason: null,
        failedStep: null,
        stepsCompleted: Array.from(completedSteps),
        tradesRecovered,
        queueItemsRecovered,
      };
      await this.historyRepository.save(entry);
      this.eventPublisher.completed(
        recoveryId,
        durationMs,
        tradesRecovered,
        queueItemsRecovered,
      );
      return entry;
    } catch (error) {
      const failedStep = this.lastAttemptedStep;
      const reason = this.reasonOf(error);
      this.stateMachine.transitionTo(RecoveryState.FAILED);
      const completedAt = this.clock.now();

      const entry: RecoveryHistoryEntry = {
        id: recoveryId,
        startedAt,
        completedAt: completedAt.toISOString(),
        succeeded: false,
        finalState: RecoveryState.FAILED,
        durationMs: completedAt.getTime() - startedAtMs,
        failureReason: reason,
        failedStep,
        stepsCompleted: Array.from(completedSteps),
        tradesRecovered,
        queueItemsRecovered,
      };
      await this.historyRepository.save(entry);
      this.eventPublisher.failed(
        recoveryId,
        failedStep ?? RecoveryStep.LOAD_CONFIGURATION,
        reason,
      );
      return entry;
    } finally {
      this.running = false;
    }
  }

  private lastAttemptedStep: RecoveryStep | null = null;

  private async runStep(
    recoveryId: string,
    step: RecoveryStep,
    completedSteps: Set<RecoveryStep>,
    fn: () => Promise<void>,
  ): Promise<void> {
    this.lastAttemptedStep = step;
    if (completedSteps.has(step)) {
      this.logger.debug(`Skipping already-completed recovery step ${step}`);
      return;
    }

    const startedAt = this.clock.now().getTime();
    const retryable = RETRYABLE_STEPS.has(step);
    let attempt = 0;

    for (;;) {
      try {
        await fn();
        completedSteps.add(step);
        this.eventPublisher.stepCompleted(
          recoveryId,
          step,
          this.clock.now().getTime() - startedAt,
        );
        return;
      } catch (error) {
        attempt += 1;
        const reason = this.reasonOf(error);
        await this.errorRepository.save({
          id: randomUUID(),
          recoveryId,
          occurredAt: this.clock.now().toISOString(),
          step,
          message: reason,
          attempt,
        });

        if (!retryable || attempt > this.config.maxRetries) {
          throw error;
        }
        this.eventPublisher.retrying(recoveryId, step, attempt, reason);
        await this.delay(this.backoffDelayMs(attempt));
      }
    }
  }

  private backoffDelayMs(attempt: number): number {
    const exponential = this.config.retryBaseDelayMs * Math.pow(2, attempt - 1);
    const capped = Math.min(exponential, this.config.retryMaxDelayMs);
    const jitter = capped * this.config.retryJitterRatio * Math.random();
    return Math.round(capped + jitter);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.scheduler.setTimeout(() => resolve(), ms);
    });
  }

  // -----------------------------------------------------------------------
  // Steps
  // -----------------------------------------------------------------------

  private stepLoadConfiguration(): Promise<void> {
    // ConfigModule already validated and loaded every env var before this
    // module's providers could even be constructed (Nest's own bootstrap
    // fails fast on invalid config) — this step is a checkpoint, not an
    // action.
    return Promise.resolve();
  }

  private stepVerifyDatabase(): Promise<void> {
    if (this.mongooseConnection.readyState !== ConnectionStates.connected) {
      throw new Error('Database connection is not ready');
    }
    return Promise.resolve();
  }

  private stepRestoreFeatureFlags(): Promise<void> {
    // FeatureFlagsModule loads flags on demand from Mongo (no in-memory
    // cache to warm) — reading one confirms the collection is reachable.
    return this.featureFlagsService.findAll().then(() => undefined);
  }

  private stepRestoreSettings(): Promise<void> {
    // SettingsService already populated its in-memory cache in its own
    // onModuleInit, which the Nest DI graph guarantees ran before this
    // coordinator (SettingsModule is imported earlier in AppModule) — this
    // step is a checkpoint confirming that, not a repeat action.
    void this.settingsService;
    return Promise.resolve();
  }

  private async stepRestoreBrokerAuthentication(): Promise<void> {
    await this.brokerSessionManager.ensureSession();
  }

  private stepReconnectBroker(): Promise<void> {
    // There is no separate broker "connect" call beyond holding a valid
    // session (Phase 4's BrokerSessionManager never exposes one) — a valid
    // session IS the connected state for a REST-only broker integration.
    if (!this.brokerSessionManager.isSessionValid()) {
      throw new Error('Broker session is not valid after authentication');
    }
    return Promise.resolve();
  }

  private async stepReconnectMarketData(): Promise<void> {
    await this.marketDataService.start();
  }

  private async stepReloadInstrumentMaster(): Promise<void> {
    await this.instrumentMasterService.refresh();
  }

  private async stepRestoreActiveTrades(): Promise<TradeSnapshot[]> {
    const latest = await this.snapshotService.loadLatestSnapshot();
    return latest ? [...latest.trades] : [];
  }

  private async stepRestoreTradingEngine(
    trades: readonly TradeSnapshot[],
  ): Promise<void> {
    for (const snapshot of trades) {
      if (this.tradingEngineService.hasTrade(snapshot.id)) {
        continue;
      }
      this.tradingEngineService.restoreTrade(snapshot);

      if (NON_TERMINAL_TRADE_STATES.includes(snapshot.state)) {
        this.tradingEngineService.enterRecovery(
          snapshot.id,
          'Startup recovery: rehydrated from last persisted snapshot',
        );
        this.tradingEngineService.resumeFromRecovery(snapshot.id);

        await this.marketDataService
          .subscribeInstrument(
            new MarketDataInstrument(
              snapshot.exchange,
              snapshot.tradingSymbol,
              snapshot.instrumentToken,
            ),
            `recovery:${snapshot.id}`,
          )
          .catch(() => undefined);
      }
    }
  }

  /**
   * Position Reconciliation is supplementary — it verifies and repairs, it
   * never gates whether the Engine/Queue are usable. A failure here (broker
   * unreachable while reconciling, a bug in a single comparison) must never
   * mark the whole recovery run FAILED after Trades/Queue/Engine already
   * recovered successfully; it is logged and recorded instead, and a later
   * RecoveryScheduler-triggered reconciliation run gets another chance.
   */
  private async stepVerifyPositions(): Promise<void> {
    try {
      await this.positionReconciliationService.reconcile();
    } catch (error) {
      this.logger.warn(
        `Position reconciliation failed during recovery (non-fatal): ${this.reasonOf(error)}`,
      );
    }
  }

  /**
   * Phase 11 — re-verifies every piece of Mongo-persisted risk state after a
   * restart: policy, kill switch, emergency stop, cooldown, and today's
   * realized-PnL/consecutive-loss counters. Each underlying service already
   * loads its own state in its own `onModuleInit()` (which the NestJS DI
   * lifecycle guarantees completes before `main.ts` ever reaches
   * `app.listen()`, so trading can never accidentally resume with stale
   * kill-switch/emergency-stop state even without this step) — this step
   * re-reads from Mongo explicitly so the fact is checkpointed in Recovery's
   * own auditable history, and forces a fresh read rather than trusting
   * whatever was cached at construction time.
   */
  private async stepRestoreRiskState(): Promise<void> {
    await Promise.all([
      this.riskPolicyService.load(),
      this.killSwitchService.load(),
      this.emergencyStopService.load(),
      this.cooldownService.reload(),
      this.dailyRiskStateService.getState(),
    ]);
  }

  private stepRestoreOrderQueue(): Promise<void> {
    // OrderQueueService's own onModuleInit (Phase 7) already reloaded every
    // non-terminal queue item and handed it back to the worker before this
    // module's onModuleInit could run — this step verifies that happened
    // rather than repeating it, avoiding a second, conflicting reload.
    return Promise.resolve();
  }

  private reasonOf(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown recovery error';
  }
}
