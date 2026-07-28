import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { TradingEngineService } from '@modules/trading-engine/trading-engine.service';
import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import { TradeState } from '@modules/trading-engine/domain/trade-state.enum';
import type { IOrderExecutor } from '@modules/broker/executors/order-executor.interface';
import type { PaperExecutor } from '@modules/broker/executors/paper.executor';
import type { AngelOneExecutor } from '@modules/broker/executors/angel-one/angel-one.executor';
import { OrderResponse } from '@modules/broker/executors/models/order-response.model';
import { OrderStatus } from '@modules/broker/executors/models/order-status.enum';
import { AutoRepairService } from './auto-repair.service';
import { FakeRepairActionRepository } from './testing/fake-repair-action-repository';
import { FakeClock } from './testing/fake-clock';
import { MismatchLevel } from './models/mismatch-level.enum';
import type { ReconciliationReport } from './models/reconciliation-report.model';
import type { LocalPositionView } from './models/local-position-view.model';
import type { BrokerPositionView } from './models/broker-position-view.model';
import { AutoRepairSucceededEvent, AutoRepairFailedEvent } from './events';

function report(
  overrides: Partial<ReconciliationReport> = {},
): ReconciliationReport {
  return {
    id: 'report-1',
    tradeId: 't1',
    generatedAt: new Date().toISOString(),
    mismatches: [
      {
        field: 'orderState',
        level: MismatchLevel.ERROR,
        localValue: 'ENTRY_PENDING',
        brokerValue: 'FILLED',
        description: 'catch-up',
      },
    ],
    overallLevel: MismatchLevel.ERROR,
    autoRepaired: false,
    manualReviewRequired: false,
    ...overrides,
  };
}

describe('AutoRepairService', () => {
  let eventBus: IEventBus;
  let publishSpy: jest.Mock;
  let clock: FakeClock;
  let repository: FakeRepairActionRepository;
  let tradingEngineService: TradingEngineService;
  let service: AutoRepairService;

  beforeEach(() => {
    publishSpy = jest.fn();
    eventBus = {
      publish: publishSpy,
      subscribe: jest.fn(),
      subscribeToAll: jest.fn(),
    };
    clock = new FakeClock();
    repository = new FakeRepairActionRepository();
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
      } as unknown as AngelOneExecutor,
      clock,
    );
    service = new AutoRepairService(
      tradingEngineService,
      eventBus,
      clock,
      repository,
    );
  });

  describe('isSafeToRepair', () => {
    it('is true for an ERROR-level orderState catch-up mismatch', () => {
      expect(service.isSafeToRepair(report())).toBe(true);
    });

    it('is false for any CRITICAL-level report', () => {
      expect(
        service.isSafeToRepair(
          report({ overallLevel: MismatchLevel.CRITICAL }),
        ),
      ).toBe(false);
    });

    it('is false when there is no orderState catch-up mismatch', () => {
      expect(
        service.isSafeToRepair(
          report({
            mismatches: [
              {
                field: 'averagePrice',
                level: MismatchLevel.WARNING,
                localValue: '100',
                brokerValue: '105',
                description: 'price drift',
              },
            ],
          }),
        ),
      ).toBe(false);
    });
  });

  describe('repair', () => {
    it('replays the broker-confirmed fill through applyRecoveredOrderResponse and marks the report repaired', async () => {
      // Drive a trade to ENTRY_PENDING with a broker order id, without ever
      // resolving the fill locally — the broker acknowledges (OPEN) but
      // never confirms — the exact "crash after broker response" scenario.
      const executor: IOrderExecutor = {
        placeEntryOrder: jest
          .fn()
          .mockResolvedValue(
            new OrderResponse(
              'BROKER-1',
              OrderStatus.OPEN,
              0,
              null,
              new Date(),
            ),
          ),
        modifyOrder: jest.fn(),
        cancelOrder: jest.fn(),
        exitPosition: jest.fn(),
        getOrderStatus: jest.fn(),
      };
      const engineWithControlledExecutor = new TradingEngineService(
        eventBus,
        executor as unknown as PaperExecutor,
        executor as unknown as AngelOneExecutor,
        clock,
      );
      const pending = engineWithControlledExecutor.createTrade({
        direction: TradeDirection.LONG,
        exchange: 'NFO',
        tradingSymbol: 'NIFTY24500CE',
        instrumentToken: 'TOKEN-1',
        quantity: 50,
        entryTriggerPrice: 100,
        initialStopLoss: 95,
        targets: [110],
        mode: 'PAPER',
      });
      await engineWithControlledExecutor.handleMarketPriceUpdate(
        pending.instrumentToken,
        100,
      );
      expect(engineWithControlledExecutor.getTrade(pending.id).state).toBe(
        TradeState.ENTRY_PENDING,
      );

      const repairService = new AutoRepairService(
        engineWithControlledExecutor,
        eventBus,
        clock,
        repository,
      );

      const local: LocalPositionView = {
        tradeId: pending.id,
        tradingSymbol: pending.tradingSymbol,
        exchange: pending.exchange,
        instrumentToken: pending.instrumentToken,
        side: pending.direction,
        quantity: pending.quantity,
        filledQuantity: 0,
        openQuantity: 0,
        averagePrice: null,
        currentStopLoss: pending.initialStopLoss,
        targets: pending.targets,
        remainingTargets: pending.remainingTargets,
        tradeState: TradeState.ENTRY_PENDING,
        entryOrderId: 'BROKER-1',
        exitOrderId: null,
      };
      const broker: BrokerPositionView = {
        tradeId: pending.id,
        entryOrderStatus: OrderStatus.FILLED,
        entryFilledQuantity: 50,
        entryAveragePrice: 101,
        exitOrderStatus: null,
        exitFilledQuantity: null,
        exitAveragePrice: null,
      };

      const result = await repairService.repair(
        report({ tradeId: pending.id }),
        local,
        broker,
      );

      expect(result.autoRepaired).toBe(true);
      expect(result.manualReviewRequired).toBe(false);
      expect(engineWithControlledExecutor.getTrade(pending.id).state).toBe(
        TradeState.ACTIVE,
      );
      expect(repository.all()).toHaveLength(1);
      expect(repository.all()[0].succeeded).toBe(true);
      const events = publishSpy.mock.calls.map(([e]: [unknown]) => e);
      expect(events.some((e) => e instanceof AutoRepairSucceededEvent)).toBe(
        true,
      );
    });

    it('records a failed repair action and publishes AutoRepairFailedEvent when the engine call throws', async () => {
      const local: LocalPositionView = {
        tradeId: 'unknown-trade',
        tradingSymbol: 'X',
        exchange: 'NFO',
        instrumentToken: 'T',
        side: TradeDirection.LONG,
        quantity: 1,
        filledQuantity: 0,
        openQuantity: 0,
        averagePrice: null,
        currentStopLoss: 0,
        targets: [],
        remainingTargets: [],
        tradeState: TradeState.ENTRY_PENDING,
        entryOrderId: 'BROKER-X',
        exitOrderId: null,
      };
      const broker: BrokerPositionView = {
        tradeId: 'unknown-trade',
        entryOrderStatus: OrderStatus.FILLED,
        entryFilledQuantity: 1,
        entryAveragePrice: 1,
        exitOrderStatus: null,
        exitFilledQuantity: null,
        exitAveragePrice: null,
      };

      const result = await service.repair(
        report({ tradeId: 'unknown-trade' }),
        local,
        broker,
      );

      expect(result.manualReviewRequired).toBe(true);
      expect(repository.all()[0].succeeded).toBe(false);
      const events = publishSpy.mock.calls.map(([e]: [unknown]) => e);
      expect(events.some((e) => e instanceof AutoRepairFailedEvent)).toBe(true);
    });

    it('is a no-op when the local trade has no entry order id', async () => {
      const local: LocalPositionView = {
        tradeId: 't1',
        tradingSymbol: 'X',
        exchange: 'NFO',
        instrumentToken: 'T',
        side: TradeDirection.LONG,
        quantity: 1,
        filledQuantity: 0,
        openQuantity: 0,
        averagePrice: null,
        currentStopLoss: 0,
        targets: [],
        remainingTargets: [],
        tradeState: TradeState.WAITING_ENTRY,
        entryOrderId: null,
        exitOrderId: null,
      };
      const broker: BrokerPositionView = {
        tradeId: 't1',
        entryOrderStatus: null,
        entryFilledQuantity: null,
        entryAveragePrice: null,
        exitOrderStatus: null,
        exitFilledQuantity: null,
        exitAveragePrice: null,
      };

      const input = report();
      const result = await service.repair(input, local, broker);

      expect(result).toEqual(input);
      expect(repository.all()).toHaveLength(0);
    });
  });
});
