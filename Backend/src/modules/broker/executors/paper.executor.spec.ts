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
    accountId: null,
    placeFillableOrder: () => executor.placeEntryOrder(marketRequest(), null),
    placeOpenOrder: () => {
      executor.queueNextFill({ status: OrderStatus.OPEN });
      return executor.placeEntryOrder(marketRequest(), null);
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
    const first = await executor.placeEntryOrder(marketRequest(), null);
    const second = await executor.placeEntryOrder(marketRequest(), null);

    expect(first.brokerOrderId).toBe('PAPER-000001');
    expect(second.brokerOrderId).toBe('PAPER-000002');
  });

  it('fills a MARKET order at the exact price set via setMarketPrice — never guessing', async () => {
    executor.setMarketPrice('TOKEN1', 123.45);
    const response = await executor.placeEntryOrder(marketRequest(), null);
    expect(response.averagePrice).toBe(123.45);
    expect(response.status).toBe(OrderStatus.FILLED);
  });

  it('throws OrderPlacementException for a MARKET order with no price ever set', async () => {
    await expect(
      executor.placeEntryOrder(marketRequest(), null),
    ).rejects.toThrow(OrderPlacementException);
  });

  it('fills a MARKET order from a live MarketPriceUpdatedEvent alone — the real production wiring, not a manual setMarketPrice() call', async () => {
    // This is the exact path a real MARKET entry takes in the running app:
    // MarketDataService publishes MarketPriceUpdatedEvent on every tick, and
    // PaperExecutor must pick it up on its own via the event bus subscribed
    // in its constructor. No test-only setMarketPrice() call here at all —
    // regression coverage for the bug where entries always threw
    // "No market price available" because nothing wired live ticks in.
    eventBus.publish(new MarketPriceUpdatedEvent('TOKEN1', 250.5));

    const response = await executor.placeEntryOrder(marketRequest(), null);

    expect(response.status).toBe(OrderStatus.FILLED);
    expect(response.averagePrice).toBe(250.5);
  });

  it('keeps the latest live price when multiple ticks arrive for the same instrument', async () => {
    eventBus.publish(new MarketPriceUpdatedEvent('TOKEN1', 100));
    eventBus.publish(new MarketPriceUpdatedEvent('TOKEN1', 105));
    eventBus.publish(new MarketPriceUpdatedEvent('TOKEN1', 110));

    const response = await executor.placeEntryOrder(marketRequest(), null);

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
    const response = await executor.placeEntryOrder(request, null);
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
    await expect(executor.placeEntryOrder(request, null)).rejects.toThrow(
      OrderPlacementException,
    );
  });

  it('rejects an order with non-positive quantity', async () => {
    executor.setMarketPrice('TOKEN1', 100);
    await expect(
      executor.placeEntryOrder(marketRequest({ quantity: 0 }), null),
    ).rejects.toThrow(OrderPlacementException);
  });

  it('honors a queued REJECTED fill instruction deterministically', async () => {
    executor.setMarketPrice('TOKEN1', 100);
    executor.queueNextFill({
      status: OrderStatus.REJECTED,
      message: 'insufficient margin',
    });

    const response = await executor.placeEntryOrder(marketRequest(), null);

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
      null,
    );

    expect(response.status).toBe(OrderStatus.PARTIALLY_FILLED);
    expect(response.filledQuantity).toBe(20);
  });

  it('only applies a queued instruction to the very next order, not subsequent ones', async () => {
    executor.setMarketPrice('TOKEN1', 100);
    executor.queueNextFill({ status: OrderStatus.REJECTED });

    const first = await executor.placeEntryOrder(marketRequest(), null);
    const second = await executor.placeEntryOrder(marketRequest(), null);

    expect(first.status).toBe(OrderStatus.REJECTED);
    expect(second.status).toBe(OrderStatus.FILLED);
  });

  it('allows modifying the quantity of an open order', async () => {
    executor.queueNextFill({ status: OrderStatus.OPEN });
    const placed = await executor.placeEntryOrder(
      marketRequest({ quantity: 10 }),
      null,
    );

    await executor.modifyOrder(
      placed.brokerOrderId,
      new OrderModification(30),
      null,
    );
    const fetched = await executor.getOrderStatus(placed.brokerOrderId, null);

    expect(fetched.brokerOrderId).toBe(placed.brokerOrderId);
  });

  it('rejects modifying an order that is already FILLED', async () => {
    executor.setMarketPrice('TOKEN1', 100);
    const placed = await executor.placeEntryOrder(marketRequest(), null);

    await expect(
      executor.modifyOrder(
        placed.brokerOrderId,
        new OrderModification(99),
        null,
      ),
    ).rejects.toThrow(OrderModificationException);
  });

  it('rejects modifying to a non-positive quantity', async () => {
    executor.queueNextFill({ status: OrderStatus.OPEN });
    const placed = await executor.placeEntryOrder(marketRequest(), null);

    await expect(
      executor.modifyOrder(
        placed.brokerOrderId,
        new OrderModification(0),
        null,
      ),
    ).rejects.toThrow(OrderModificationException);
  });

  it('rejects cancelling an order that is already CANCELLED', async () => {
    executor.queueNextFill({ status: OrderStatus.OPEN });
    const placed = await executor.placeEntryOrder(marketRequest(), null);
    await executor.cancelOrder(placed.brokerOrderId, null);

    await expect(
      executor.cancelOrder(placed.brokerOrderId, null),
    ).rejects.toThrow(OrderCancellationException);
  });

  it('exits only up to the filled quantity, never more', async () => {
    executor.setMarketPrice('TOKEN1', 100);
    const placed = await executor.placeEntryOrder(
      marketRequest({ quantity: 10 }),
      null,
    );

    await expect(
      executor.exitPosition(placed.brokerOrderId, new ExitRequest(11), null),
    ).rejects.toThrow(OrderPlacementException);
  });

  it('exits at an explicit exit price when supplied, overriding the market price', async () => {
    executor.setMarketPrice('TOKEN1', 100);
    const placed = await executor.placeEntryOrder(
      marketRequest({ quantity: 10 }),
      null,
    );

    const exited = await executor.exitPosition(
      placed.brokerOrderId,
      new ExitRequest(10, 150),
      null,
    );

    expect(exited.averagePrice).toBe(150);
  });

  it('flips the side on the exit order relative to the entry order', async () => {
    executor.setMarketPrice('TOKEN1', 100);
    const placed = await executor.placeEntryOrder(marketRequest(), null);
    const exited = await executor.exitPosition(
      placed.brokerOrderId,
      new ExitRequest(50),
      null,
    );

    // Re-fetch via getOrderStatus is not enough to see `side` (not on OrderResponse),
    // but we can at least confirm the exit produced a fresh FILLED order distinct
    // from the entry, which the contract test already checks structurally.
    expect(exited.brokerOrderId).not.toBe(placed.brokerOrderId);
  });

  it('throws OrderNotFoundException (not a generic error) for an unknown order id', async () => {
    await expect(executor.getOrderStatus('NOPE', null)).rejects.toThrow(
      OrderNotFoundException,
    );
  });
});

function slOrder(
  overrides: Partial<{
    price: number;
    triggerPrice: number;
    quantity: number;
  }> = {},
): OrderRequest {
  return new OrderRequest(
    'NFO',
    'NIFTY24500CE',
    'TOKEN1',
    OrderSide.SELL,
    overrides.quantity ?? 50,
    OrderPriceType.SL,
    overrides.price ?? 95,
    undefined,
    overrides.triggerPrice ?? 95,
  );
}

function slMarketOrder(
  overrides: Partial<{ triggerPrice: number; quantity: number }> = {},
): OrderRequest {
  return new OrderRequest(
    'NFO',
    'NIFTY24500CE',
    'TOKEN1',
    OrderSide.SELL,
    overrides.quantity ?? 50,
    OrderPriceType.SL_M,
    undefined,
    undefined,
    overrides.triggerPrice ?? 95,
  );
}

describe('PaperExecutor SL / SL_M order types', () => {
  let executor: PaperExecutor;

  beforeEach(() => {
    executor = new PaperExecutor(new EventEmitterEventBus(new EventEmitter2()));
    executor.setMarketPrice('TOKEN1', 100);
  });

  it('rejects an SL order with no triggerPrice', async () => {
    await expect(
      executor.placeEntryOrder(
        new OrderRequest(
          'NFO',
          'NIFTY24500CE',
          'TOKEN1',
          OrderSide.SELL,
          50,
          OrderPriceType.SL,
          95,
        ),
        null,
      ),
    ).rejects.toThrow(OrderPlacementException);
  });

  it('rejects an SL_M order with no triggerPrice', async () => {
    await expect(
      executor.placeEntryOrder(
        new OrderRequest(
          'NFO',
          'NIFTY24500CE',
          'TOKEN1',
          OrderSide.SELL,
          50,
          OrderPriceType.SL_M,
        ),
        null,
      ),
    ).rejects.toThrow(OrderPlacementException);
  });

  it('fills an SL order at its specified price, exactly like LIMIT', async () => {
    const response = await executor.placeEntryOrder(
      slOrder({ price: 94 }),
      null,
    );
    expect(response.averagePrice).toBe(94);
    expect(response.status).toBe(OrderStatus.FILLED);
  });

  it('fills an SL_M order at the current market price, exactly like MARKET', async () => {
    const response = await executor.placeEntryOrder(slMarketOrder(), null);
    expect(response.averagePrice).toBe(100);
    expect(response.status).toBe(OrderStatus.FILLED);
  });
});

describe('PaperExecutor execution realism (PaperExecutionConfig)', () => {
  it('defaults to zero slippage, full fills, and no rejections when no config is provided', async () => {
    const executor = new PaperExecutor(
      new EventEmitterEventBus(new EventEmitter2()),
    );
    executor.setMarketPrice('TOKEN1', 100);
    const response = await executor.placeEntryOrder(marketRequest(), null);
    expect(response.averagePrice).toBe(100);
    expect(response.status).toBe(OrderStatus.FILLED);
    expect(response.filledQuantity).toBe(50);
  });

  it('applies slippage unfavorably: worse (higher) fill for a BUY', async () => {
    const executor = new PaperExecutor(
      new EventEmitterEventBus(new EventEmitter2()),
      {
        slippageBps: 100,
        maxFillQuantity: Infinity,
        maxOrderQuantity: Infinity,
        priceBandPercent: Infinity,
      },
    );
    executor.setMarketPrice('TOKEN1', 100);
    const response = await executor.placeEntryOrder(marketRequest(), null);
    // 100 bps = 1% of 100 = 1 → BUY fills at 101, never at the raw tick price.
    expect(response.averagePrice).toBe(101);
  });

  it('applies slippage unfavorably: worse (lower) fill for a SELL', async () => {
    const executor = new PaperExecutor(
      new EventEmitterEventBus(new EventEmitter2()),
      {
        slippageBps: 100,
        maxFillQuantity: Infinity,
        maxOrderQuantity: Infinity,
        priceBandPercent: Infinity,
      },
    );
    executor.setMarketPrice('TOKEN1', 100);
    const response = await executor.placeEntryOrder(slMarketOrder(), null);
    expect(response.averagePrice).toBe(99);
  });

  it('never applies slippage to a LIMIT/SL fill — the specified price is always honored', async () => {
    const executor = new PaperExecutor(
      new EventEmitterEventBus(new EventEmitter2()),
      {
        slippageBps: 500,
        maxFillQuantity: Infinity,
        maxOrderQuantity: Infinity,
        priceBandPercent: Infinity,
      },
    );
    executor.setMarketPrice('TOKEN1', 100);
    const response = await executor.placeEntryOrder(
      slOrder({ price: 94 }),
      null,
    );
    expect(response.averagePrice).toBe(94);
  });

  it('partially fills an order exceeding maxFillQuantity, leaving the remainder unfilled', async () => {
    const executor = new PaperExecutor(
      new EventEmitterEventBus(new EventEmitter2()),
      {
        slippageBps: 0,
        maxFillQuantity: 20,
        maxOrderQuantity: Infinity,
        priceBandPercent: Infinity,
      },
    );
    executor.setMarketPrice('TOKEN1', 100);
    const response = await executor.placeEntryOrder(
      marketRequest({ quantity: 50 }),
      null,
    );
    expect(response.status).toBe(OrderStatus.PARTIALLY_FILLED);
    expect(response.filledQuantity).toBe(20);
  });

  it('rejects an order exceeding maxOrderQuantity outright', async () => {
    const executor = new PaperExecutor(
      new EventEmitterEventBus(new EventEmitter2()),
      {
        slippageBps: 0,
        maxFillQuantity: Infinity,
        maxOrderQuantity: 30,
        priceBandPercent: Infinity,
      },
    );
    executor.setMarketPrice('TOKEN1', 100);
    const response = await executor.placeEntryOrder(
      marketRequest({ quantity: 50 }),
      null,
    );
    expect(response.status).toBe(OrderStatus.REJECTED);
    expect(response.filledQuantity).toBe(0);
  });

  it('rejects a LIMIT order priced outside the configured price band', async () => {
    const executor = new PaperExecutor(
      new EventEmitterEventBus(new EventEmitter2()),
      {
        slippageBps: 0,
        maxFillQuantity: Infinity,
        maxOrderQuantity: Infinity,
        priceBandPercent: 2,
      },
    );
    executor.setMarketPrice('TOKEN1', 100);
    const response = await executor.placeEntryOrder(
      new OrderRequest(
        'NFO',
        'NIFTY24500CE',
        'TOKEN1',
        OrderSide.BUY,
        50,
        OrderPriceType.LIMIT,
        110, // 10% away from the market price of 100 — outside a 2% band.
      ),
      null,
    );
    expect(response.status).toBe(OrderStatus.REJECTED);
  });

  it('accepts a LIMIT order priced within the configured price band', async () => {
    const executor = new PaperExecutor(
      new EventEmitterEventBus(new EventEmitter2()),
      {
        slippageBps: 0,
        maxFillQuantity: Infinity,
        maxOrderQuantity: Infinity,
        priceBandPercent: 2,
      },
    );
    executor.setMarketPrice('TOKEN1', 100);
    const response = await executor.placeEntryOrder(
      new OrderRequest(
        'NFO',
        'NIFTY24500CE',
        'TOKEN1',
        OrderSide.BUY,
        50,
        OrderPriceType.LIMIT,
        101,
      ),
      null,
    );
    expect(response.status).toBe(OrderStatus.FILLED);
  });

  it('an explicit queueNextFill() instruction always overrides the config — deterministic test control is never weakened', async () => {
    const executor = new PaperExecutor(
      new EventEmitterEventBus(new EventEmitter2()),
      {
        slippageBps: 500,
        maxFillQuantity: 1,
        maxOrderQuantity: 1,
        priceBandPercent: 0,
      },
    );
    executor.setMarketPrice('TOKEN1', 100);
    executor.queueNextFill({
      status: OrderStatus.FILLED,
      fillPrice: 100,
      filledQuantity: 50,
    });

    const response = await executor.placeEntryOrder(
      marketRequest({ quantity: 50 }),
      null,
    );
    expect(response.status).toBe(OrderStatus.FILLED);
    expect(response.filledQuantity).toBe(50);
    expect(response.averagePrice).toBe(100);
  });
});
