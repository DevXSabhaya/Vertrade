import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { PositionReconciliationService } from './position-reconciliation.service';
import type {
  ReconciliationEngine,
  ReconciliationResult,
} from './reconciliation-engine.service';
import type { AutoRepairService } from './auto-repair.service';
import type { ManualReviewService } from './manual-review.service';
import type { ReconciliationReporter } from './reconciliation-reporter.service';
import { MismatchLevel } from './models/mismatch-level.enum';
import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import { TradeState } from '@modules/trading-engine/domain/trade-state.enum';
import {
  PositionMismatchDetectedEvent,
  PositionReconciledEvent,
} from './events';

function result(
  overrides: Partial<ReconciliationResult['report']> = {},
): ReconciliationResult {
  return {
    report: {
      id: 'r1',
      tradeId: 't1',
      generatedAt: new Date().toISOString(),
      mismatches: [],
      overallLevel: MismatchLevel.NO_DIFFERENCE,
      autoRepaired: false,
      manualReviewRequired: false,
      ...overrides,
    },
    local: {
      tradeId: 't1',
      tradingSymbol: 'X',
      exchange: 'NFO',
      instrumentToken: 'T',
      side: TradeDirection.LONG,
      quantity: 1,
      filledQuantity: 1,
      openQuantity: 1,
      averagePrice: 1,
      currentStopLoss: 1,
      targets: [],
      remainingTargets: [],
      tradeState: TradeState.ACTIVE,
      entryOrderId: 'E-1',
      exitOrderId: null,
    },
    broker: {
      tradeId: 't1',
      entryOrderStatus: null,
      entryFilledQuantity: null,
      entryAveragePrice: null,
      exitOrderStatus: null,
      exitFilledQuantity: null,
      exitAveragePrice: null,
    },
  };
}

describe('PositionReconciliationService', () => {
  let engine: jest.Mocked<Pick<ReconciliationEngine, 'run'>>;
  let autoRepairService: jest.Mocked<
    Pick<AutoRepairService, 'isSafeToRepair' | 'repair'>
  >;
  let manualReviewService: jest.Mocked<
    Pick<ManualReviewService, 'flagForReview'>
  >;
  let reporter: jest.Mocked<
    Pick<ReconciliationReporter, 'persist' | 'getLatest' | 'getHistory'>
  >;
  let eventBus: IEventBus;
  let publishSpy: jest.Mock;
  let service: PositionReconciliationService;

  beforeEach(() => {
    engine = { run: jest.fn().mockResolvedValue([]) };
    autoRepairService = {
      isSafeToRepair: jest.fn().mockReturnValue(false),
      repair: jest.fn(),
    };
    manualReviewService = {
      flagForReview: jest.fn((r) => ({ ...r, manualReviewRequired: true })),
    };
    reporter = {
      persist: jest.fn().mockResolvedValue(undefined),
      getLatest: jest.fn().mockResolvedValue(null),
      getHistory: jest.fn().mockResolvedValue([]),
    };
    publishSpy = jest.fn();
    eventBus = {
      publish: publishSpy,
      subscribe: jest.fn(),
      subscribeToAll: jest.fn(),
    };

    service = new PositionReconciliationService(
      engine as unknown as ReconciliationEngine,
      autoRepairService as unknown as AutoRepairService,
      manualReviewService as unknown as ManualReviewService,
      reporter as unknown as ReconciliationReporter,
      eventBus,
    );
  });

  it('does nothing beyond persisting when there is no mismatch', async () => {
    engine.run.mockResolvedValue([result()]);

    const reports = await service.reconcile();

    expect(reports).toHaveLength(1);
    expect(autoRepairService.repair).not.toHaveBeenCalled();
    expect(manualReviewService.flagForReview).not.toHaveBeenCalled();
    expect(reporter.persist).toHaveBeenCalledWith(reports[0]);
    const events = publishSpy.mock.calls.map(([e]: [unknown]) => e);
    expect(events.some((e) => e instanceof PositionMismatchDetectedEvent)).toBe(
      false,
    );
    expect(events.some((e) => e instanceof PositionReconciledEvent)).toBe(true);
  });

  it('auto-repairs a safe mismatch and persists the repaired report', async () => {
    const r = result({ overallLevel: MismatchLevel.ERROR });
    engine.run.mockResolvedValue([r]);
    autoRepairService.isSafeToRepair.mockReturnValue(true);
    autoRepairService.repair.mockResolvedValue({
      ...r.report,
      autoRepaired: true,
    });

    const reports = await service.reconcile();

    expect(autoRepairService.repair).toHaveBeenCalledWith(
      r.report,
      r.local,
      r.broker,
    );
    expect(reports[0].autoRepaired).toBe(true);
    expect(manualReviewService.flagForReview).not.toHaveBeenCalled();
  });

  it('routes an unsafe (manual-review-required) mismatch to ManualReviewService', async () => {
    const r = result({
      overallLevel: MismatchLevel.CRITICAL,
      manualReviewRequired: true,
    });
    engine.run.mockResolvedValue([r]);
    autoRepairService.isSafeToRepair.mockReturnValue(false);

    const reports = await service.reconcile();

    expect(autoRepairService.repair).not.toHaveBeenCalled();
    expect(manualReviewService.flagForReview).toHaveBeenCalledWith(r.report);
    expect(reports[0].manualReviewRequired).toBe(true);
    const events = publishSpy.mock.calls.map(([e]: [unknown]) => e);
    expect(events.some((e) => e instanceof PositionMismatchDetectedEvent)).toBe(
      true,
    );
  });

  it('getLatestReport()/getHistory() delegate to the reporter', async () => {
    await service.getLatestReport();
    await service.getHistory();
    expect(reporter.getLatest).toHaveBeenCalled();
    expect(reporter.getHistory).toHaveBeenCalled();
  });
});
