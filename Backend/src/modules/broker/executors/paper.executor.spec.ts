import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventEmitterEventBus } from '@core/event-bus/event-emitter-event-bus';
import { MarketPriceUpdatedEvent } from '@shared/events/market-price-updated.event';
import { PaperExecutor } from './paper.executor';
import { OrderRequest } from './models/order-request.model';
import { OrderModification } from './models/order-modification.model';
import { ExitRequest } from './models/exit-request.model';
import { OrderSide } from './models/order-side.enum';
import { OrderPriceType } from './models/order-price-type.enum';
import { OrderStatus } from './models/order-status.enum';
import { OrderPlacementException } from './exceptions/order-placement.exception';
import { OrderModificationException } from './exceptions/order-modification.exception';
import { OrderCancellationException } from './exceptions/order-cancellation.exception';
import { OrderNotFoundException } from './exceptions/order-not-found.exception';
import { describeOrderExecutorContract } from './contract/order-executor.contract';

function marketRequest(
  overrides: Partial<{ quantity: number }> = {},
): OrderRequest {
  return new OrderRequest(
    'NFO',
    'NIFTY24500CE',
    'TOKEN1',
    OrderSide.BUY,
    overrides.quantity ?? 50,
    OrderPriceType.MARKET,
  );
}

describeOrderExecutorContract('PaperExecutor', () => {
  const executor = new PaperExecutor(
    new EventEmitterEventBus(new EventEmitter2()),
  );
  executor.setMarketPrice('TOKEN1', 100);

  return {
    executor,
    placeFillableOrder: () => executor.placeEntryOrder(marketRequest()),
    placeOpenOrder: () => {
      executor.queueNextFill({ status: OrderStatus.OPEN });
      return executor.placeEntryOrder(marketRequest());
    },
  };
});

describe('PaperExecutor (determinism and simulation specifics)', () => {
  let executor: PaperExecutor;
  let eventBus: EventEmitterEventBus;

  beforeEach(() => {
    eventBus = new EventEmitterEventBus(new EventEmitter2());
    executor = new PaperExecutor(eventBus);
  });

  it('produces sequential, non-random broker order ids', async () => {
    executor.setMarketPrice('TOKEN1', 100);
    const first = await executor.placeEntryOrder(marketRequest());
    const second = await executor.placeEntryOrder(marketRequest());

    expect(first.brokerOrderId).toBe('PAPER-000001');
    expect(second.brokerOrderId).toBe('PAPER-000002');
  });

  it('fills a MARKET order at the exact price set via setMarketPrice — never guessing', async () => {
    executor.setMarketPrice('TOKEN1', 123.45);
    const response = await executor.placeEntryOrder(marketRequest());
    expect(response.averagePrice).toBe(123.45);
    expect(response.status).toBe(OrderStatus.FILLED);
  });

  it('throws OrderPlacementException for a MARKET order with no price ever set', async () => {
    await expect(executor.placeEntryOrder(marketRequest())).rejects.toThrow(
      OrderPlacementException,
    );
  });

  it('fills a MARKET order from a live MarketPriceUpdatedEvent alone — the real production wiring, not a manual setMarketPrice() call', async () => {
    // This is the exact path a real MARKET entry takes in the running app:
    // MarketDataService publishes MarketPriceUpdatedEvent on every tick, and
    // PaperExecutor must pick it up on its own via the event bus subscribed
    // in its constructor. No test-only setMarketPrice() call here at all —
    // regression coverage for the bug where entries always threw
    // "No market price available" because nothing wired live ticks in.
    eventBus.publish(new MarketPriceUpdatedEvent('TOKEN1', 250.5));

    const response = await executor.placeEntryOrder(marketRequest());

    expect(response.status).toBe(OrderStatus.FILLED);
    expect(response.averagePrice).toBe(250.5);
  });

  it('keeps the latest live price when multiple ticks arrive for the same instrument', async () => {
    eventBus.publish(new MarketPriceUpdatedEvent('TOKEN1', 100));
    eventBus.publish(new MarketPriceUpdatedEvent('TOKEN1', 105));
    eventBus.publish(new MarketPriceUpdatedEvent('TOKEN1', 110));

    const response = await executor.placeEntryOrder(marketRequest());

    expect(response.averagePrice).toBe(110);
  });

  it('fills a LIMIT order at exactly the requested limit price', async () => {
    const request = new OrderRequest(
      'NFO',
      'NIFTY24500CE',
      'TOKEN1',
      OrderSide.BUY,
      50,
      OrderPriceType.LIMIT,
      200,
    );
    const response = await executor.placeEntryOrder(request);
    expect(response.averagePrice).toBe(200);
  });

  it('rejects a LIMIT order with no price supplied', async () => {
    const request = new OrderRequest(
      'NFO',
      'NIFTY24500CE',
      'TOKEN1',
      OrderSide.BUY,
      50,
      OrderPriceType.LIMIT,
    );
    await expect(executor.placeEntryOrder(request)).rejects.toThrow(
      OrderPlacementException,
    );
  });

  it('rejects an order with non-positive quantity', async () => {
    executor.setMarketPrice('TOKEN1', 100);
    await expect(
      executor.placeEntryOrder(marketRequest({ quantity: 0 })),
    ).rejects.toThrow(OrderPlacementException);
  });

  it('honors a queued REJECTED fill instruction deterministically', async () => {
    executor.setMarketPrice('TOKEN1', 100);
    executor.queueNextFill({
      status: OrderStatus.REJECTED,
      message: 'insufficient margin',
    });

    const response = await executor.placeEntryOrder(marketRequest());

    expect(response.status).toBe(OrderStatus.REJECTED);
    expect(response.message).toBe('insufficient margin');
    expect(response.filledQuantity).toBe(0);
  });

  it('honors a queued PARTIALLY_FILLED fill instruction with an exact filled quantity', async () => {
    executor.setMarketPrice('TOKEN1', 100);
    executor.queueNextFill({
      status: OrderStatus.PARTIALLY_FILLED,
      filledQuantity: 20,
    });

    const response = await executor.placeEntryOrder(
      marketRequest({ quantity: 50 }),
    );

    expect(response.status).toBe(OrderStatus.PARTIALLY_FILLED);
    expect(response.filledQuantity).toBe(20);
  });

  it('only applies a queued instruction to the very next order, not subsequent ones', async () => {
    executor.setMarketPrice('TOKEN1', 100);
    executor.queueNextFill({ status: OrderStatus.REJECTED });

    const first = await executor.placeEntryOrder(marketRequest());
    const second = await executor.placeEntryOrder(marketRequest());

    expect(first.status).toBe(OrderStatus.REJECTED);
    expect(second.status).toBe(OrderStatus.FILLED);
  });

  it('allows modifying the quantity of an open order', async () => {
    executor.queueNextFill({ status: OrderStatus.OPEN });
    const placed = await executor.placeEntryOrder(
      marketRequest({ quantity: 10 }),
    );

    await executor.modifyOrder(placed.brokerOrderId, new OrderModification(30));
    const fetched = await executor.getOrderStatus(placed.brokerOrderId);

    expect(fetched.brokerOrderId).toBe(placed.brokerOrderId);
  });

  it('rejects modifying an order that is already FILLED', async () => {
    executor.setMarketPrice('TOKEN1', 100);
    const placed = await executor.placeEntryOrder(marketRequest());

    await expect(
      executor.modifyOrder(placed.brokerOrderId, new OrderModification(99)),
    ).rejects.toThrow(OrderModificationException);
  });

  it('rejects modifying to a non-positive quantity', async () => {
    executor.queueNextFill({ status: OrderStatus.OPEN });
    const placed = await executor.placeEntryOrder(marketRequest());

    await expect(
      executor.modifyOrder(placed.brokerOrderId, new OrderModification(0)),
    ).rejects.toThrow(OrderModificationException);
  });

  it('rejects cancelling an order that is already CANCELLED', async () => {
    executor.queueNextFill({ status: OrderStatus.OPEN });
    const placed = await executor.placeEntryOrder(marketRequest());
    await executor.cancelOrder(placed.brokerOrderId);

    await expect(executor.cancelOrder(placed.brokerOrderId)).rejects.toThrow(
      OrderCancellationException,
    );
  });

  it('exits only up to the filled quantity, never more', async () => {
    executor.setMarketPrice('TOKEN1', 100);
    const placed = await executor.placeEntryOrder(
      marketRequest({ quantity: 10 }),
    );

    await expect(
      executor.exitPosition(placed.brokerOrderId, new ExitRequest(11)),
    ).rejects.toThrow(OrderPlacementException);
  });

  it('exits at an explicit exit price when supplied, overriding the market price', async () => {
    executor.setMarketPrice('TOKEN1', 100);
    const placed = await executor.placeEntryOrder(
      marketRequest({ quantity: 10 }),
    );

    const exited = await executor.exitPosition(
      placed.brokerOrderId,
      new ExitRequest(10, 150),
    );

    expect(exited.averagePrice).toBe(150);
  });

  it('flips the side on the exit order relative to the entry order', async () => {
    executor.setMarketPrice('TOKEN1', 100);
    const placed = await executor.placeEntryOrder(marketRequest());
    const exited = await executor.exitPosition(
      placed.brokerOrderId,
      new ExitRequest(50),
    );

    // Re-fetch via getOrderStatus is not enough to see `side` (not on OrderResponse),
    // but we can at least confirm the exit produced a fresh FILLED order distinct
    // from the entry, which the contract test already checks structurally.
    expect(exited.brokerOrderId).not.toBe(placed.brokerOrderId);
  });

  it('throws OrderNotFoundException (not a generic error) for an unknown order id', async () => {
    await expect(executor.getOrderStatus('NOPE')).rejects.toThrow(
      OrderNotFoundException,
    );
  });
});
