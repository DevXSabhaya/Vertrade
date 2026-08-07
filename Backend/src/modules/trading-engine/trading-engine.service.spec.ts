import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventEmitterEventBus } from '@core/event-bus/event-emitter-event-bus';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { IClock } from '@shared/clock/clock.interface';
import type { IOrderExecutor } from '@modules/broker/executors/order-executor.interface';
import type { PaperExecutor } from '@modules/broker/executors/paper.executor';
import type { DhanExecutor } from '@modules/broker/executors/dhan/dhan.executor';
import type { OrderRequest } from '@modules/broker/executors/models/order-request.model';
import type { ExitRequest } from '@modules/broker/executors/models/exit-request.model';
import { OrderResponse } from '@modules/broker/executors/models/order-response.model';
import { OrderStatus } from '@modules/broker/executors/models/order-status.enum';
import { TradingEngineService } from './trading-engine.service';
import { TradeDirection } from './domain/trade-direction.enum';
import { TradeState } from './domain/trade-state.enum';
import type { CreateTradeParams } from './domain/create-trade.params';
import { TradeNotFoundException } from './exceptions/trade-not-found.exception';
import { InvalidExitRequestException } from './exceptions/invalid-exit-request.exception';
import { MarketPriceUpdatedEvent } from './events/market-price-updated.event';
import { TradeCompletedEvent } from './events/trade-completed.event';

class FakeClock implements IClock {
  private current = 1_700_000_000_000;

  now(): Date {
    this.current += 1;
    return new Date(this.current);
  }
}

/**
 * A fully deterministic, in-memory IOrderExecutor test double — no real
 * broker/network involved, full control over what each call returns so every
 * scenario (fill, partial fill, reject, fail, exit) is reproducible.
 */
class FakeOrderExecutor implements IOrderExecutor {
  nextEntryResponse: OrderResponse | null = null;
  nextEntryError: Error | null = null;
  nextExitResponse: OrderResponse | null = null;
  nextExitError: Error | null = null;
  placeEntryOrderCalls: OrderRequest[] = [];
  exitPositionCalls: { brokerOrderId: string; request: ExitRequest }[] = [];
  cancelOrderCalls: string[] = [];

  private sequence = 0;

  placeEntryOrder(request: OrderRequest): Promise<OrderResponse> {
    this.placeEntryOrderCalls.push(request);
    if (this.nextEntryError) {
      const error = this.nextEntryError;
      this.nextEntryError = null;
      return Promise.reject(error);
    }
    this.sequence += 1;
    const response =
      this.nextEntryResponse ??
      new OrderResponse(
        `FAKE-${this.sequence}`,
        OrderStatus.FILLED,
        request.quantity,
        request.price ?? 100,
        new Date(),
      );
    this.nextEntryResponse = null;
    return Promise.resolve(response);
  }

  exitPosition(
    brokerOrderId: string,
    request: ExitRequest,
  ): Promise<OrderResponse> {
    this.exitPositionCalls.push({ brokerOrderId, request });
    if (this.nextExitError) {
      const error = this.nextExitError;
      this.nextExitError = null;
      return Promise.reject(error);
    }
    this.sequence += 1;
    const response =
      this.nextExitResponse ??
      new OrderResponse(
        `FAKE-EXIT-${this.sequence}`,
        OrderStatus.FILLED,
        request.quantity,
        request.price ?? 100,
        new Date(),
      );
    this.nextExitResponse = null;
    return Promise.resolve(response);
  }

  cancelOrder(brokerOrderId: string): Promise<OrderResponse> {
    this.cancelOrderCalls.push(brokerOrderId);
    return Promise.resolve(
      new OrderResponse(
        brokerOrderId,
        OrderStatus.CANCELLED,
        0,
        null,
        new Date(),
      ),
    );
  }

  modifyOrder(brokerOrderId: string): Promise<OrderResponse> {
    return Promise.resolve(
      new OrderResponse(brokerOrderId, OrderStatus.OPEN, 0, null, new Date()),
    );
  }

  getOrderStatus(brokerOrderId: string): Promise<OrderResponse> {
    return Promise.resolve(
      new OrderResponse(brokerOrderId, OrderStatus.FILLED, 0, null, new Date()),
    );
  }
}

function tradeParams(
  overrides: Partial<CreateTradeParams> = {},
): CreateTradeParams {
  return {
    direction: TradeDirection.LONG,
    exchange: 'NFO',
    tradingSymbol: 'NIFTY24500CE',
    instrumentToken: 'TOKEN-1',
    quantity: 50,
    entryTriggerPrice: 100,
    initialStopLoss: 95,
    targets: [110, 120, 135, 150],
    mode: 'PAPER',
    brokerAccountId: null,
    ...overrides,
  };
}

describe('TradingEngineService', () => {
  let eventBus: IEventBus;
  let executor: FakeOrderExecutor;
  let clock: FakeClock;
  let service: TradingEngineService;
  let publishSpy: jest.Mock;

  beforeEach(() => {
    publishSpy = jest.fn();
    eventBus = {
      publish: publishSpy,
      subscribe: jest.fn(),
      subscribeToAll: jest.fn(),
    };
    executor = new FakeOrderExecutor();
    clock = new FakeClock();
    service = new TradingEngineService(
      eventBus,
      executor as unknown as PaperExecutor,
      executor as unknown as DhanExecutor,
      clock,
    );
  });

  it('creates a trade in WAITING_ENTRY and publishes TradeCreatedEvent', () => {
    const snapshot = service.createTrade(tradeParams());

    expect(snapshot.state).toBe(TradeState.WAITING_ENTRY);
    expect(publishSpy).toHaveBeenCalled();
  });

  it('throws TradeNotFoundException for an unknown trade id', () => {
    expect(() => service.getTrade('missing')).toThrow(TradeNotFoundException);
  });

  it('subscribes to MarketPriceUpdatedEvent on construction', () => {
    expect(eventBus.subscribe).toHaveBeenCalledWith(
      MarketPriceUpdatedEvent.EVENT_NAME,
      expect.any(Function),
    );
  });

  describe('price-driven lifecycle', () => {
    it('does nothing while price stays below the entry trigger', async () => {
      const snapshot = service.createTrade(tradeParams());
      await service.handleMarketPriceUpdate(snapshot.instrumentToken, 99);

      expect(service.getTrade(snapshot.id).state).toBe(
        TradeState.WAITING_ENTRY,
      );
      expect(executor.placeEntryOrderCalls).toHaveLength(0);
    });

    it('places the entry order and becomes ACTIVE once price crosses entry', async () => {
      const snapshot = service.createTrade(tradeParams());
      executor.nextEntryResponse = new OrderResponse(
        'E-1',
        OrderStatus.FILLED,
        50,
        100,
        new Date(),
      );

      await service.handleMarketPriceUpdate(snapshot.instrumentToken, 100);

      const after = service.getTrade(snapshot.id);
      expect(after.state).toBe(TradeState.ACTIVE);
      expect(after.entryOrderId).toBe('E-1');
      expect(executor.placeEntryOrderCalls).toHaveLength(1);
    });

    it('drives targets and trailing SL across successive price ticks', async () => {
      const snapshot = service.createTrade(tradeParams());
      await service.handleMarketPriceUpdate(snapshot.instrumentToken, 100);

      await service.handleMarketPriceUpdate(snapshot.instrumentToken, 110);
      expect(service.getTrade(snapshot.id).currentStopLoss).toBe(100);

      await service.handleMarketPriceUpdate(snapshot.instrumentToken, 120);
      expect(service.getTrade(snapshot.id).currentStopLoss).toBe(110);
    });

    it('exits and completes the trade once price falls back to the trailed stop loss', async () => {
      const snapshot = service.createTrade(tradeParams());
      await service.handleMarketPriceUpdate(snapshot.instrumentToken, 100); // entry fill
      await service.handleMarketPriceUpdate(snapshot.instrumentToken, 110); // target 1, SL -> 100

      executor.nextExitResponse = new OrderResponse(
        'X-1',
        OrderStatus.FILLED,
        50,
        100,
        new Date(),
      );
      await service.handleMarketPriceUpdate(snapshot.instrumentToken, 100); // SL touched -> exit

      const after = service.getTrade(snapshot.id);
      expect(after.state).toBe(TradeState.COMPLETED);
      expect(after.realizedPnl).toBe(0);
      expect(executor.exitPositionCalls).toHaveLength(1);
      expect(
        publishSpy.mock.calls.some(
          ([event]) => event instanceof TradeCompletedEvent,
        ),
      ).toBe(true);
    });

    it('retries the exit on the next tick if the exit attempt itself throws', async () => {
      const snapshot = service.createTrade(tradeParams());
      await service.handleMarketPriceUpdate(snapshot.instrumentToken, 100);

      executor.nextExitError = new Error('network blip');
      await service.handleMarketPriceUpdate(snapshot.instrumentToken, 95);
      expect(service.getTrade(snapshot.id).state).toBe(TradeState.ACTIVE);
      expect(executor.exitPositionCalls).toHaveLength(1);

      executor.nextExitResponse = new OrderResponse(
        'X-1',
        OrderStatus.FILLED,
        50,
        95,
        new Date(),
      );
      await service.handleMarketPriceUpdate(snapshot.instrumentToken, 95);
      expect(service.getTrade(snapshot.id).state).toBe(TradeState.COMPLETED);
      expect(executor.exitPositionCalls).toHaveLength(2);
    });

    it('terminates as REJECTED when the broker rejects the entry order', async () => {
      const snapshot = service.createTrade(tradeParams());
      executor.nextEntryResponse = new OrderResponse(
        'E-1',
        OrderStatus.REJECTED,
        0,
        null,
        new Date(),
        'no margin',
      );

      await service.handleMarketPriceUpdate(snapshot.instrumentToken, 100);

      expect(service.getTrade(snapshot.id).state).toBe(TradeState.REJECTED);
    });

    it('terminates as FAILED when placing the entry order throws', async () => {
      const snapshot = service.createTrade(tradeParams());
      executor.nextEntryError = new Error('connection reset');

      await service.handleMarketPriceUpdate(snapshot.instrumentToken, 100);

      expect(service.getTrade(snapshot.id).state).toBe(TradeState.FAILED);
    });

    it('a duplicate identical price update is a no-op the second time', async () => {
      const snapshot = service.createTrade(tradeParams());
      await service.handleMarketPriceUpdate(snapshot.instrumentToken, 100);
      await service.handleMarketPriceUpdate(snapshot.instrumentToken, 110);
      const afterFirst = service.getTrade(snapshot.id);

      await service.handleMarketPriceUpdate(snapshot.instrumentToken, 110);
      const afterSecond = service.getTrade(snapshot.id);

      expect(afterSecond.currentStopLoss).toBe(afterFirst.currentStopLoss);
      expect(afterSecond.remainingTargets).toEqual(afterFirst.remainingTargets);
    });

    it('only evaluates trades matching the updated instrument token', async () => {
      const tradeA = service.createTrade(
        tradeParams({ instrumentToken: 'TOKEN-A' }),
      );
      const tradeB = service.createTrade(
        tradeParams({ instrumentToken: 'TOKEN-B' }),
      );

      await service.handleMarketPriceUpdate('TOKEN-A', 100);

      expect(service.getTrade(tradeA.id).state).toBe(TradeState.ACTIVE);
      expect(service.getTrade(tradeB.id).state).toBe(TradeState.WAITING_ENTRY);
    });
  });

  describe('cancellation', () => {
    it('cancels a trade waiting for entry', async () => {
      const snapshot = service.createTrade(tradeParams());
      const result = await service.cancelTrade(snapshot.id, 'user cancelled');
      expect(result.state).toBe(TradeState.CANCELLED);
    });

    it('cancels the broker order first when cancelling a pending entry', async () => {
      const snapshot = service.createTrade(tradeParams());
      executor.nextEntryResponse = new OrderResponse(
        'E-1',
        OrderStatus.OPEN,
        0,
        null,
        new Date(),
      );
      await service.handleMarketPriceUpdate(snapshot.instrumentToken, 100);
      expect(service.getTrade(snapshot.id).state).toBe(
        TradeState.ENTRY_PENDING,
      );

      const result = await service.cancelTrade(snapshot.id, 'user cancelled');

      expect(result.state).toBe(TradeState.CANCELLED);
      expect(executor.cancelOrderCalls).toEqual(['E-1']);
    });
  });

  describe('pruneCompletedTrades (memory bounding)', () => {
    it('keeps memory bounded after tens of thousands of completed trades, while never touching an active one', async () => {
      const TRADE_COUNT = 20_000;
      for (let i = 0; i < TRADE_COUNT; i += 1) {
        const snapshot = service.createTrade(
          tradeParams({ instrumentToken: `BULK-${i}` }),
        );
        await service.cancelTrade(snapshot.id, 'bulk cleanup test');
      }
      const activeSnapshot = service.createTrade(
        tradeParams({ instrumentToken: 'STILL-ACTIVE' }),
      );

      expect(service.getAllTrades()).toHaveLength(TRADE_COUNT + 1);

      const removedCount = service.pruneCompletedTrades(0);

      expect(removedCount).toBe(TRADE_COUNT);
      // Every terminal trade is gone from memory...
      expect(service.getAllTrades()).toHaveLength(1);
      // ...but the one still-open trade survives untouched, regardless of
      // how aggressive the retention window is.
      expect(service.hasTrade(activeSnapshot.id)).toBe(true);
      expect(service.getTrade(activeSnapshot.id).state).toBe(
        TradeState.WAITING_ENTRY,
      );
    }, 30_000);

    it('never prunes a trade younger than maxAgeMs, even if terminal', async () => {
      const snapshot = service.createTrade(tradeParams());
      await service.cancelTrade(snapshot.id, 'test');

      const removedCount = service.pruneCompletedTrades(24 * 60 * 60 * 1000);

      expect(removedCount).toBe(0);
      expect(service.hasTrade(snapshot.id)).toBe(true);
    });

    it('never prunes a non-terminal trade, however old it claims to be', () => {
      const snapshot = service.createTrade(tradeParams());

      const removedCount = service.pruneCompletedTrades(0);

      expect(removedCount).toBe(0);
      expect(service.hasTrade(snapshot.id)).toBe(true);
      expect(service.getTrade(snapshot.id).state).toBe(
        TradeState.WAITING_ENTRY,
      );
    });
  });

  describe('recovery', () => {
    it('enters and resumes from recovery', async () => {
      const snapshot = service.createTrade(tradeParams());
      await service.handleMarketPriceUpdate(snapshot.instrumentToken, 100);

      service.enterRecovery(snapshot.id, 'restart');
      expect(service.getTrade(snapshot.id).state).toBe(TradeState.RECOVERY);

      const resumed = service.resumeFromRecovery(snapshot.id);
      expect(resumed.state).toBe(TradeState.ACTIVE);
    });
  });

  describe('updateTrailingStopLoss (Phase 10 — Trailing Stop Engine)', () => {
    it('moves the stop loss forward and publishes an event', async () => {
      const snapshot = service.createTrade(tradeParams());
      await service.handleMarketPriceUpdate(snapshot.instrumentToken, 100);
      publishSpy.mockClear();

      const result = service.updateTrailingStopLoss(snapshot.id, 97);

      expect(result.currentStopLoss).toBe(97);
      expect(publishSpy).toHaveBeenCalled();
    });

    it('is a silent no-op when the proposed value would move the stop loss backward', async () => {
      const snapshot = service.createTrade(tradeParams());
      await service.handleMarketPriceUpdate(snapshot.instrumentToken, 100);
      service.updateTrailingStopLoss(snapshot.id, 97);

      const result = service.updateTrailingStopLoss(snapshot.id, 90);

      expect(result.currentStopLoss).toBe(97);
    });
  });

  describe('requestPartialExit / requestFullExit (Phase 10 — Target/Exit Managers)', () => {
    it('requestPartialExit exits only the requested quantity, keeping the trade ACTIVE for the remainder', async () => {
      const snapshot = service.createTrade(tradeParams());
      await service.handleMarketPriceUpdate(snapshot.instrumentToken, 100);
      executor.nextExitResponse = new OrderResponse(
        'EXIT-1',
        OrderStatus.PARTIALLY_FILLED,
        20,
        110,
        new Date(),
      );

      const result = await service.requestPartialExit(snapshot.id, 20, 110);

      expect(result.state).toBe(TradeState.ACTIVE);
      expect(result.exitedQuantity).toBe(20);
      expect(result.openQuantity).toBe(30);
    });

    it('requestFullExit exits the entire open quantity and completes the trade', async () => {
      const snapshot = service.createTrade(tradeParams());
      await service.handleMarketPriceUpdate(snapshot.instrumentToken, 100);
      executor.nextExitResponse = new OrderResponse(
        'EXIT-2',
        OrderStatus.FILLED,
        50,
        105,
        new Date(),
      );

      const result = await service.requestFullExit(snapshot.id, 105);

      expect(result.state).toBe(TradeState.COMPLETED);
      expect(result.openQuantity).toBe(0);
    });

    it('requestPartialExit rejects a quantity larger than the open quantity', async () => {
      const snapshot = service.createTrade(tradeParams());
      await service.handleMarketPriceUpdate(snapshot.instrumentToken, 100);

      await expect(
        service.requestPartialExit(snapshot.id, 999, 100),
      ).rejects.toThrow(InvalidExitRequestException);
    });

    it('requestPartialExit rejects a non-positive quantity', async () => {
      const snapshot = service.createTrade(tradeParams());
      await service.handleMarketPriceUpdate(snapshot.instrumentToken, 100);

      await expect(
        service.requestPartialExit(snapshot.id, 0, 100),
      ).rejects.toThrow(InvalidExitRequestException);
    });

    it('requestFullExit rejects a trade that is not ACTIVE', async () => {
      const snapshot = service.createTrade(tradeParams());

      await expect(service.requestFullExit(snapshot.id, 100)).rejects.toThrow(
        InvalidExitRequestException,
      );
    });
  });

  describe('restoreTrade (Phase 9 — Startup Recovery)', () => {
    it('rehydrates a persisted snapshot into the in-memory map', () => {
      const snapshot = service.createTrade(tradeParams());
      const freshService = new TradingEngineService(
        eventBus,
        executor as unknown as PaperExecutor,
        executor as unknown as DhanExecutor,
        clock,
      );

      expect(freshService.hasTrade(snapshot.id)).toBe(false);
      freshService.restoreTrade(snapshot);

      expect(freshService.hasTrade(snapshot.id)).toBe(true);
      expect(freshService.getTrade(snapshot.id)).toEqual(snapshot);
    });

    it('is idempotent: restoring a trade already in memory is a silent no-op', () => {
      const snapshot = service.createTrade(tradeParams());
      publishSpy.mockClear();

      service.restoreTrade(snapshot);

      expect(publishSpy).not.toHaveBeenCalled();
      expect(service.getTrade(snapshot.id).state).toBe(snapshot.state);
    });

    it('never publishes any event on its own', () => {
      const snapshot = service.createTrade(tradeParams());
      const freshService = new TradingEngineService(
        eventBus,
        executor as unknown as PaperExecutor,
        executor as unknown as DhanExecutor,
        clock,
      );
      publishSpy.mockClear();

      freshService.restoreTrade(snapshot);

      expect(publishSpy).not.toHaveBeenCalled();
    });
  });

  describe('applyRecoveredOrderResponse (Phase 9 — Position Reconciliation auto-repair)', () => {
    it('applies a broker-confirmed entry fill the local trade never recorded (crash-after-broker-response)', async () => {
      // The broker acknowledges the order but hasn't confirmed a fill yet
      // (OPEN) — the trade stays ENTRY_PENDING, exactly as it would if the
      // process crashed right after this response and before the broker's
      // later fill confirmation was ever received locally.
      executor.nextEntryResponse = new OrderResponse(
        'BROKER-1',
        OrderStatus.OPEN,
        0,
        null,
        new Date(),
      );
      const snapshot = service.createTrade(tradeParams());
      await service.handleMarketPriceUpdate(snapshot.instrumentToken, 100);
      expect(service.getTrade(snapshot.id).state).toBe(
        TradeState.ENTRY_PENDING,
      );

      // Position Reconciliation discovers the broker actually filled it.
      const result = service.applyRecoveredOrderResponse(
        snapshot.id,
        'ENTRY',
        new OrderResponse(
          'BROKER-1',
          OrderStatus.FILLED,
          snapshot.quantity,
          101,
          new Date(),
        ),
      );

      expect(result.state).toBe(TradeState.ACTIVE);
      expect(result.filledQuantity).toBe(snapshot.quantity);
      expect(result.entryFillPrice).toBe(101);
    });

    it('publishes the same domain events applyEntryOrderResponse would on the live tick path', async () => {
      executor.nextEntryResponse = new OrderResponse(
        'BROKER-2',
        OrderStatus.OPEN,
        0,
        null,
        new Date(),
      );
      const snapshot = service.createTrade(tradeParams());
      await service.handleMarketPriceUpdate(snapshot.instrumentToken, 100);
      publishSpy.mockClear();

      service.applyRecoveredOrderResponse(
        snapshot.id,
        'ENTRY',
        new OrderResponse(
          'BROKER-2',
          OrderStatus.FILLED,
          snapshot.quantity,
          101,
          new Date(),
        ),
      );

      expect(publishSpy).toHaveBeenCalled();
    });

    it('throws TradeNotFoundException for an unknown trade id', () => {
      expect(() =>
        service.applyRecoveredOrderResponse(
          'does-not-exist',
          'ENTRY',
          new OrderResponse('X', OrderStatus.FILLED, 1, 1, new Date()),
        ),
      ).toThrow(TradeNotFoundException);
    });
  });

  describe('wiring: real event bus dispatches to handleMarketPriceUpdate', () => {
    it('processes a MarketPriceUpdatedEvent published through the real event bus', async () => {
      const realBus = new EventEmitterEventBus(new EventEmitter2());
      const wiredService = new TradingEngineService(
        realBus,
        executor as unknown as PaperExecutor,
        executor as unknown as DhanExecutor,
        clock,
      );
      const snapshot = wiredService.createTrade(tradeParams());

      realBus.publish(
        new MarketPriceUpdatedEvent(snapshot.instrumentToken, 100),
      );
      await new Promise((resolve) => setImmediate(resolve));

      expect(wiredService.getTrade(snapshot.id).state).toBe(TradeState.ACTIVE);
    });
  });

  describe('per-trade executor routing', () => {
    let paperExecutor: FakeOrderExecutor;
    let dhanExecutor: FakeOrderExecutor;
    let routingService: TradingEngineService;

    beforeEach(() => {
      paperExecutor = new FakeOrderExecutor();
      dhanExecutor = new FakeOrderExecutor();
      routingService = new TradingEngineService(
        eventBus,
        paperExecutor as unknown as PaperExecutor,
        dhanExecutor as unknown as DhanExecutor,
        clock,
      );
    });

    it("routes a PAPER-mode trade's entry to PaperExecutor only, never DhanExecutor", async () => {
      const snapshot = routingService.createTrade(
        tradeParams({ mode: 'PAPER', instrumentToken: 'TOKEN-PAPER' }),
      );

      await routingService.handleMarketPriceUpdate('TOKEN-PAPER', 100);

      expect(paperExecutor.placeEntryOrderCalls).toHaveLength(1);
      expect(dhanExecutor.placeEntryOrderCalls).toHaveLength(0);
      expect(routingService.getTrade(snapshot.id).state).toBe(
        TradeState.ACTIVE,
      );
    });

    it("routes a LIVE-mode trade's entry to DhanExecutor only, never PaperExecutor", async () => {
      const snapshot = routingService.createTrade(
        tradeParams({
          mode: 'LIVE',
          instrumentToken: 'TOKEN-LIVE',
          brokerAccountId: 'acc-1',
        }),
      );

      await routingService.handleMarketPriceUpdate('TOKEN-LIVE', 100);

      expect(dhanExecutor.placeEntryOrderCalls).toHaveLength(1);
      expect(paperExecutor.placeEntryOrderCalls).toHaveLength(0);
      expect(routingService.getTrade(snapshot.id).state).toBe(
        TradeState.ACTIVE,
      );
    });

    it('two trades created with different modes each keep using their own executor for their whole lifecycle — no cross-contamination', async () => {
      const paperTrade = routingService.createTrade(
        tradeParams({ mode: 'PAPER', instrumentToken: 'TOKEN-A' }),
      );
      const liveTrade = routingService.createTrade(
        tradeParams({
          mode: 'LIVE',
          instrumentToken: 'TOKEN-B',
          brokerAccountId: 'acc-1',
        }),
      );

      await routingService.handleMarketPriceUpdate('TOKEN-A', 100);
      await routingService.handleMarketPriceUpdate('TOKEN-B', 100);

      expect(paperExecutor.placeEntryOrderCalls).toHaveLength(1);
      expect(dhanExecutor.placeEntryOrderCalls).toHaveLength(1);

      // Exit each — still must stay on its own originally-pinned executor.
      await routingService.requestFullExit(paperTrade.id, 110);
      await routingService.requestFullExit(liveTrade.id, 110);

      expect(paperExecutor.exitPositionCalls).toHaveLength(1);
      expect(dhanExecutor.exitPositionCalls).toHaveLength(1);
    });

    it('cancelling a LIVE-mode trade before entry fills routes cancelOrder to DhanExecutor, not PaperExecutor', async () => {
      dhanExecutor.nextEntryResponse = new OrderResponse(
        'LIVE-PENDING-1',
        OrderStatus.OPEN,
        0,
        null,
        new Date(),
      );
      const snapshot = routingService.createTrade(
        tradeParams({
          mode: 'LIVE',
          instrumentToken: 'TOKEN-CANCEL',
          brokerAccountId: 'acc-1',
        }),
      );
      await routingService.handleMarketPriceUpdate('TOKEN-CANCEL', 100);
      expect(routingService.getTrade(snapshot.id).state).toBe(
        TradeState.ENTRY_PENDING,
      );

      await routingService.cancelTrade(snapshot.id, 'user requested');

      expect(dhanExecutor.cancelOrderCalls).toHaveLength(1);
      expect(paperExecutor.cancelOrderCalls).toHaveLength(0);
    });
  });
});
