import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { FeatureFlagsService } from '@core/feature-flags/feature-flag.service';
import type { SettingsService } from '@modules/settings/settings.service';
import type { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import type { MarketDataService } from '@modules/market-data/market-data.service';
import type { InstrumentMasterService } from '@modules/instrument-master/instrument-master.service';
import { TradingEngineService } from '@modules/trading-engine/trading-engine.service';
import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import { TradeState } from '@modules/trading-engine/domain/trade-state.enum';
import type { TradeSnapshot } from '@modules/trading-engine/domain/trade-snapshot';
import type { PaperExecutor } from '@modules/broker/executors/paper.executor';
import type { DhanExecutor } from '@modules/broker/executors/dhan/dhan.executor';
import type { OrderQueueService } from '@modules/order-queue/order-queue.service';
import type { PositionReconciliationService } from '@modules/position-reconciliation/position-reconciliation.service';
import type { RiskPolicyService } from '@modules/risk-management/risk-policy.service';
import type { KillSwitchService } from '@modules/risk-management/kill-switch.service';
import type { EmergencyStopService } from '@modules/risk-management/emergency-stop.service';
import type { CooldownService } from '@modules/risk-management/cooldown.service';
import type { DailyRiskStateService } from '@modules/risk-management/daily-risk-state.service';
import { RecoveryCoordinator } from './recovery-coordinator.service';
import { RecoveryStateMachine } from './state-machine/recovery-state-machine';
import { RecoverySnapshotService } from './recovery-snapshot.service';
import { RecoveryEventPublisher } from './recovery-event-publisher';
import { RecoveryState } from './models/recovery-state.enum';
import { RecoveryStep } from './models/recovery-step.enum';
import { DEFAULT_RECOVERY_CONFIG } from './models/recovery-config.model';
import { FakeClock } from './testing/fake-clock';
import { FakeTimerScheduler } from './testing/fake-timer-scheduler';
import { FakeRecoveryHistoryRepository } from './testing/fake-recovery-history-repository';
import { FakeRecoveryErrorRepository } from './testing/fake-recovery-error-repository';
import { FakeRecoverySnapshotRepository } from './testing/fake-recovery-snapshot-repository';
import { RecoveryAlreadyRunningException } from './exceptions/recovery-already-running.exception';
import {
  RecoveryStartedEvent,
  RecoveryCompletedEvent,
  RecoveryFailedEvent,
  RecoveryRetryingEvent,
  EngineRecoveredEvent,
  QueueRecoveredEvent,
} from './events';

function tradeSnapshot(overrides: Partial<TradeSnapshot> = {}): TradeSnapshot {
  return {
    id: 'trade-1',
    direction: TradeDirection.LONG,
    state: TradeState.ACTIVE,
    exchange: 'NFO',
    tradingSymbol: 'NIFTY24500CE',
    instrumentToken: 'TOKEN-1',
    quantity: 50,
    entryTriggerPrice: 100,
    initialStopLoss: 95,
    currentStopLoss: 95,
    targets: [110, 120],
    mode: 'PAPER',
    remainingTargets: [110, 120],
    entryOrderId: 'E-1',
    entryOrderLifecycle: null,
    entryFillPrice: 100,
    filledQuantity: 50,
    exitOrderId: null,
    exitOrderLifecycle: null,
    exitedQuantity: 0,
    exitProceeds: 0,
    openQuantity: 50,
    exitPrice: null,
    realizedPnl: null,
    isAwaitingExit: false,
    metadata: {},
    history: [],
    createdAt: new Date(1_700_000_000_000).toISOString(),
    updatedAt: new Date(1_700_000_000_000).toISOString(),
    ...overrides,
  };
}

describe('RecoveryCoordinator', () => {
  let clock: FakeClock;
  let scheduler: FakeTimerScheduler;
  let eventBus: IEventBus;
  let publishSpy: jest.Mock;
  let historyRepository: FakeRecoveryHistoryRepository;
  let errorRepository: FakeRecoveryErrorRepository;
  let snapshotRepository: FakeRecoverySnapshotRepository;
  let featureFlagsService: jest.Mocked<Pick<FeatureFlagsService, 'findAll'>>;
  let settingsService: SettingsService;
  let brokerSessionManager: jest.Mocked<
    Pick<BrokerSessionManager, 'ensureSession' | 'isSessionValid'>
  >;
  let marketDataService: jest.Mocked<
    Pick<MarketDataService, 'start' | 'subscribeInstrument'>
  >;
  let instrumentMasterService: jest.Mocked<
    Pick<InstrumentMasterService, 'refresh'>
  >;
  let tradingEngineService: TradingEngineService;
  let orderQueueService: jest.Mocked<Pick<OrderQueueService, 'getAllItems'>>;
  let positionReconciliationService: jest.Mocked<
    Pick<PositionReconciliationService, 'reconcile'>
  >;
  let riskPolicyService: jest.Mocked<Pick<RiskPolicyService, 'load'>>;
  let killSwitchService: jest.Mocked<Pick<KillSwitchService, 'load'>>;
  let emergencyStopService: jest.Mocked<Pick<EmergencyStopService, 'load'>>;
  let cooldownService: jest.Mocked<Pick<CooldownService, 'reload'>>;
  let dailyRiskStateService: jest.Mocked<
    Pick<DailyRiskStateService, 'getState'>
  >;
  let mongooseConnection: { readyState: number };
  let snapshotService: RecoverySnapshotService;
  let coordinator: RecoveryCoordinator;

  const CONNECTED = 1;
  const DISCONNECTED = 0;

  function buildCoordinator(
    configOverrides: Partial<typeof DEFAULT_RECOVERY_CONFIG> = {},
  ): RecoveryCoordinator {
    const stateMachine = new RecoveryStateMachine();
    const eventPublisher = new RecoveryEventPublisher(eventBus);
    snapshotService = {
      loadLatestSnapshot: jest.fn().mockResolvedValue(null),
      captureAndPersist: jest.fn().mockResolvedValue(undefined),
    } as unknown as RecoverySnapshotService;

    return new RecoveryCoordinator(
      stateMachine,
      snapshotService,
      eventPublisher,
      featureFlagsService as unknown as FeatureFlagsService,
      settingsService,
      brokerSessionManager as unknown as BrokerSessionManager,
      marketDataService as unknown as MarketDataService,
      instrumentMasterService as unknown as InstrumentMasterService,
      tradingEngineService,
      orderQueueService as unknown as OrderQueueService,
      positionReconciliationService as unknown as PositionReconciliationService,
      riskPolicyService as unknown as RiskPolicyService,
      killSwitchService as unknown as KillSwitchService,
      emergencyStopService as unknown as EmergencyStopService,
      cooldownService as unknown as CooldownService,
      dailyRiskStateService as unknown as DailyRiskStateService,
      mongooseConnection as never,
      clock,
      scheduler,
      { ...DEFAULT_RECOVERY_CONFIG, ...configOverrides },
      historyRepository,
      errorRepository,
    );
  }

  /** Drains retry-loop timers by repeatedly flushing microtasks and firing pending timeouts until the run settles. */
  async function runToCompletion(
    run: () => ReturnType<RecoveryCoordinator['run']>,
  ) {
    const promise = run();
    let settled = false;
    void promise.finally(() => {
      settled = true;
    });
    for (let i = 0; i < 100 && !settled; i += 1) {
      await Promise.resolve();

      await scheduler.fireAllTimeoutsUntilDrained();
    }
    return promise;
  }

  beforeEach(() => {
    clock = new FakeClock();
    scheduler = new FakeTimerScheduler();
    publishSpy = jest.fn();
    eventBus = {
      publish: publishSpy,
      subscribe: jest.fn(),
      subscribeToAll: jest.fn(),
    };
    historyRepository = new FakeRecoveryHistoryRepository();
    errorRepository = new FakeRecoveryErrorRepository();
    snapshotRepository = new FakeRecoverySnapshotRepository();
    void snapshotRepository;

    featureFlagsService = { findAll: jest.fn().mockResolvedValue([]) };
    settingsService = {} as SettingsService;
    brokerSessionManager = {
      ensureSession: jest.fn().mockResolvedValue({ clientCode: 'C1' }),
      isSessionValid: jest.fn().mockReturnValue(true),
    };
    marketDataService = {
      start: jest.fn().mockResolvedValue(undefined),
      subscribeInstrument: jest.fn().mockResolvedValue(undefined),
    };
    instrumentMasterService = {
      refresh: jest.fn().mockResolvedValue(undefined),
    };
    tradingEngineService = new TradingEngineService(
      eventBus,
      {
        placeEntryOrder: jest.fn(),
        modifyOrder: jest.fn(),
        cancelOrder: jest.fn(),
        exitPosition: jest.fn(),
        getOrderStatus: jest.fn(),
      } as unknown as PaperExecutor,
      {
        placeEntryOrder: jest.fn(),
        modifyOrder: jest.fn(),
        cancelOrder: jest.fn(),
        exitPosition: jest.fn(),
        getOrderStatus: jest.fn(),
      } as unknown as DhanExecutor,
      clock,
    );
    orderQueueService = { getAllItems: jest.fn().mockReturnValue([]) };
    positionReconciliationService = {
      reconcile: jest.fn().mockResolvedValue([]),
    };
    riskPolicyService = { load: jest.fn().mockResolvedValue(undefined) };
    killSwitchService = { load: jest.fn().mockResolvedValue(undefined) };
    emergencyStopService = { load: jest.fn().mockResolvedValue(undefined) };
    cooldownService = { reload: jest.fn().mockResolvedValue(null) };
    dailyRiskStateService = {
      getState: jest.fn().mockResolvedValue(undefined),
    };
    mongooseConnection = { readyState: CONNECTED };

    coordinator = buildCoordinator();
  });

  describe('recovery success', () => {
    it('completes the full happy path and returns a succeeded history entry', async () => {
      const result = await runToCompletion(() => coordinator.run());

      expect(result.succeeded).toBe(true);
      expect(result.finalState).toBe(RecoveryState.COMPLETED);
      expect(coordinator.currentState()).toBe(RecoveryState.COMPLETED);
      expect(coordinator.isRunning()).toBe(false);
    });

    it('publishes RecoveryStarted and RecoveryCompleted', async () => {
      await runToCompletion(() => coordinator.run());

      const events = publishSpy.mock.calls.map(([e]: [unknown]) => e);
      expect(events.some((e) => e instanceof RecoveryStartedEvent)).toBe(true);
      expect(events.some((e) => e instanceof RecoveryCompletedEvent)).toBe(
        true,
      );
    });

    it('captures a final snapshot before completing', async () => {
      await runToCompletion(() => coordinator.run());
      expect(snapshotService.captureAndPersist).toHaveBeenCalled();
    });

    it('calls Position Reconciliation as the final step', async () => {
      await runToCompletion(() => coordinator.run());
      expect(positionReconciliationService.reconcile).toHaveBeenCalled();
    });
  });

  describe('trade restoration', () => {
    it('restores non-terminal trades into the Trading Engine and resumes them via the recovery cycle', async () => {
      const active = tradeSnapshot({
        id: 'trade-active',
        state: TradeState.ACTIVE,
      });
      (snapshotService.loadLatestSnapshot as jest.Mock).mockResolvedValue({
        id: 'snap-1',
        capturedAt: new Date().toISOString(),
        trades: [active],
        queueItems: [],
        idempotencyKeys: [],
        marketSubscriptions: [],
        engineStateSummary: {},
        brokerSessionClientCode: null,
        lastTick: null,
      });

      const result = await runToCompletion(() => coordinator.run());

      expect(result.tradesRecovered).toBe(1);
      expect(tradingEngineService.hasTrade('trade-active')).toBe(true);
      expect(tradingEngineService.getTrade('trade-active').state).toBe(
        TradeState.ACTIVE,
      );
      expect(marketDataService.subscribeInstrument).toHaveBeenCalledWith(
        expect.objectContaining({ instrumentToken: 'TOKEN-1' }),
        'recovery:trade-active',
      );

      const events = publishSpy.mock.calls.map(([e]: [unknown]) => e);
      expect(events.some((e) => e instanceof EngineRecoveredEvent)).toBe(true);
    });

    it('restores terminal trades without running them through the recovery cycle or subscribing market data', async () => {
      const completed = tradeSnapshot({
        id: 'trade-done',
        state: TradeState.COMPLETED,
      });
      (snapshotService.loadLatestSnapshot as jest.Mock).mockResolvedValue({
        id: 'snap-1',
        capturedAt: new Date().toISOString(),
        trades: [completed],
        queueItems: [],
        idempotencyKeys: [],
        marketSubscriptions: [],
        engineStateSummary: {},
        brokerSessionClientCode: null,
        lastTick: null,
      });

      await runToCompletion(() => coordinator.run());

      expect(tradingEngineService.hasTrade('trade-done')).toBe(true);
      expect(tradingEngineService.getTrade('trade-done').state).toBe(
        TradeState.COMPLETED,
      );
      expect(marketDataService.subscribeInstrument).not.toHaveBeenCalled();
    });

    it('is idempotent: restoring an already-present trade is a no-op', async () => {
      tradingEngineService.createTrade({
        direction: TradeDirection.LONG,
        exchange: 'NFO',
        tradingSymbol: 'NIFTY24500CE',
        instrumentToken: 'TOKEN-1',
        quantity: 50,
        entryTriggerPrice: 100,
        initialStopLoss: 95,
        targets: [110, 120],
        mode: 'PAPER',
      });
      const existingId = tradingEngineService.getAllTrades()[0].id;
      const snapshot = tradeSnapshot({
        id: existingId,
        state: TradeState.WAITING_ENTRY,
      });
      (snapshotService.loadLatestSnapshot as jest.Mock).mockResolvedValue({
        id: 'snap-1',
        capturedAt: new Date().toISOString(),
        trades: [snapshot],
        queueItems: [],
        idempotencyKeys: [],
        marketSubscriptions: [],
        engineStateSummary: {},
        brokerSessionClientCode: null,
        lastTick: null,
      });

      await runToCompletion(() => coordinator.run());

      expect(tradingEngineService.getAllTrades()).toHaveLength(1);
    });
  });

  describe('queue restoration', () => {
    it('counts current queue items and publishes QueueRecoveredEvent', async () => {
      orderQueueService.getAllItems.mockReturnValue([
        { id: 'q1' } as never,
        { id: 'q2' } as never,
      ]);

      const result = await runToCompletion(() => coordinator.run());

      expect(result.queueItemsRecovered).toBe(2);
      const events = publishSpy.mock.calls.map(([e]: [unknown]) => e);
      const queueEvent = events.find((e) => e instanceof QueueRecoveredEvent);
      expect(queueEvent?.itemCount).toBe(2);
    });
  });

  describe('database unavailable', () => {
    it('retries VERIFY_DATABASE, then fails the run once retries are exhausted', async () => {
      mongooseConnection.readyState = DISCONNECTED;
      coordinator = buildCoordinator({ maxRetries: 2, retryBaseDelayMs: 1 });

      const result = await runToCompletion(() => coordinator.run());

      expect(result.succeeded).toBe(false);
      expect(result.failedStep).toBe(RecoveryStep.VERIFY_DATABASE);
      expect(result.finalState).toBe(RecoveryState.FAILED);
      expect(coordinator.currentState()).toBe(RecoveryState.FAILED);

      const events = publishSpy.mock.calls.map(([e]: [unknown]) => e);
      expect(events.some((e) => e instanceof RecoveryFailedEvent)).toBe(true);
      expect(errorRepository.all().length).toBeGreaterThanOrEqual(3); // 1 initial + 2 retries
    });
  });

  describe('broker unavailable', () => {
    it('retries broker authentication, then fails at RESTORE_BROKER_AUTHENTICATION', async () => {
      brokerSessionManager.ensureSession.mockRejectedValue(
        new Error('broker unreachable'),
      );
      coordinator = buildCoordinator({ maxRetries: 1, retryBaseDelayMs: 1 });

      const result = await runToCompletion(() => coordinator.run());

      expect(result.succeeded).toBe(false);
      expect(result.failedStep).toBe(
        RecoveryStep.RESTORE_BROKER_AUTHENTICATION,
      );
    });
  });

  describe('market data unavailable', () => {
    it('retries market data reconnect, then fails at RECONNECT_MARKET_DATA', async () => {
      marketDataService.start.mockRejectedValue(new Error('ws unreachable'));
      coordinator = buildCoordinator({ maxRetries: 1, retryBaseDelayMs: 1 });

      const result = await runToCompletion(() => coordinator.run());

      expect(result.succeeded).toBe(false);
      expect(result.failedStep).toBe(RecoveryStep.RECONNECT_MARKET_DATA);
    });
  });

  describe('recovery retry', () => {
    it('succeeds after a transient failure, publishing RecoveryRetryingEvent', async () => {
      brokerSessionManager.ensureSession
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValue({ clientCode: 'C1' } as never);
      coordinator = buildCoordinator({ maxRetries: 2, retryBaseDelayMs: 1 });

      const result = await runToCompletion(() => coordinator.run());

      expect(result.succeeded).toBe(true);
      const events = publishSpy.mock.calls.map(([e]: [unknown]) => e);
      expect(events.some((e) => e instanceof RecoveryRetryingEvent)).toBe(true);
    });
  });

  describe('crash during reconciliation', () => {
    it('completes recovery successfully even if Position Reconciliation itself throws (non-fatal)', async () => {
      positionReconciliationService.reconcile.mockRejectedValue(
        new Error('broker unavailable mid-reconciliation'),
      );

      const result = await runToCompletion(() => coordinator.run());

      expect(result.succeeded).toBe(true);
      expect(result.finalState).toBe(RecoveryState.COMPLETED);
    });
  });

  describe('duplicate prevention', () => {
    it('rejects a second run() while one is already in progress', async () => {
      let resolveStart: () => void = () => undefined;
      marketDataService.start.mockReturnValue(
        new Promise((resolve) => {
          resolveStart = () => resolve(undefined);
        }),
      );

      const firstRun = coordinator.run();
      await Promise.resolve();
      await Promise.resolve();

      await expect(coordinator.run()).rejects.toThrow(
        RecoveryAlreadyRunningException,
      );

      resolveStart();
      await runToCompletion(() => firstRun);
    });
  });

  describe('resumability', () => {
    it('never restarts a step already recorded as completed by a prior incomplete run', async () => {
      historyRepository.seed({
        id: 'prior-recovery',
        startedAt: new Date(1_700_000_000_000).toISOString(),
        completedAt: null,
        succeeded: null,
        finalState: RecoveryState.MARKET_CONNECTED,
        durationMs: null,
        failureReason: null,
        failedStep: null,
        stepsCompleted: [
          RecoveryStep.LOAD_CONFIGURATION,
          RecoveryStep.VERIFY_DATABASE,
          RecoveryStep.RESTORE_FEATURE_FLAGS,
          RecoveryStep.RESTORE_SETTINGS,
          RecoveryStep.RESTORE_BROKER_AUTHENTICATION,
          RecoveryStep.RECONNECT_BROKER,
          RecoveryStep.RECONNECT_MARKET_DATA,
        ],
        tradesRecovered: 0,
        queueItemsRecovered: 0,
      });

      const result = await runToCompletion(() =>
        coordinator.run({ resume: true }),
      );

      expect(result.id).toBe('prior-recovery');
      expect(marketDataService.start).not.toHaveBeenCalled();
      expect(brokerSessionManager.ensureSession).not.toHaveBeenCalled();
      expect(instrumentMasterService.refresh).toHaveBeenCalled(); // not yet completed in the prior run
      expect(result.succeeded).toBe(true);
    });
  });
});
