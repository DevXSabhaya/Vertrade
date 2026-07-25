import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import { TradeExtensionStore } from '@modules/trade-lifecycle/trade-extension.store';
import { FakeTradeExtensionRepository } from '@modules/trade-lifecycle/testing/fake-trade-extension-repository';
import { FakeClock as TradeLifecycleFakeClock } from '@modules/trade-lifecycle/testing/fake-clock';
import { OrderSubmittedEvent } from '@modules/order-queue/events/order-submitted.event';
import type { PaperAccountService } from '@modules/paper-account/paper-account.service';
import { TrailingStrategy } from '@modules/trade-lifecycle/models/trailing-strategy.enum';
import { PaperTradeEventListener } from './paper-trade-event-listener.service';
import { PaperTradeOwnershipService } from './paper-trade-ownership.service';
import { InMemoryPaperTradeOwnershipRepository } from './testing/in-memory-ownership-repository';
import { FakeClock } from './testing/fake-clock';

/** `onModuleInit` wires subscribers as fire-and-forget (`void this.onXyz(event)`), mirroring the real event bus's behavior — flush the microtask queue so the handler's internal awaits (ownership lookups, TradeExtensionStore.patch) actually settle before assertions run. */
function flushAsync(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function buildParams(
  overrides: Partial<Parameters<PaperTradeOwnershipService['create']>[0]> = {},
) {
  return {
    userId: 'user-1',
    idempotencyKey: 'paper:user-1:abc',
    queueItemId: 'queue-item-1',
    reservedAmount: 5_000,
    rawSymbol: 'RELIANCE',
    direction: TradeDirection.LONG,
    quantity: 10,
    entryTriggerPrice: 500,
    initialStopLoss: 490,
    ...overrides,
  };
}

describe('PaperTradeEventListener', () => {
  let ownershipService: PaperTradeOwnershipService;
  let tradeExtensionStore: TradeExtensionStore;
  let listener: PaperTradeEventListener;
  let subscribers: Map<string, (event: unknown) => void>;

  beforeEach(() => {
    ownershipService = new PaperTradeOwnershipService(
      new InMemoryPaperTradeOwnershipRepository(),
      new FakeClock(),
    );
    tradeExtensionStore = new TradeExtensionStore(
      new FakeTradeExtensionRepository(),
      new TradeLifecycleFakeClock(),
    );
    subscribers = new Map();
    const fakeEventBus = {
      publish: jest.fn(),
      subscribe: (eventName: string, handler: (event: unknown) => void) => {
        subscribers.set(eventName, handler);
      },
      subscribeToAll: jest.fn(),
    } as unknown as IEventBus;
    const fakePaperAccountService = {
      rollbackReservation: jest.fn(),
      settleTrade: jest.fn(),
    } as unknown as PaperAccountService;

    listener = new PaperTradeEventListener(
      fakeEventBus,
      ownershipService,
      fakePaperAccountService,
      tradeExtensionStore,
    );
    listener.onModuleInit();
  });

  it('does nothing to trade extensions when no trailingConfig was requested', async () => {
    const ownership = await ownershipService.create(buildParams());
    const handler = subscribers.get(OrderSubmittedEvent.EVENT_NAME);
    expect(handler).toBeDefined();

    handler?.(new OrderSubmittedEvent(ownership.queueItemId, 'engine-trade-1'));
    await flushAsync();

    const extension = await tradeExtensionStore.get('engine-trade-1');
    expect(extension.trailingEnabled).toBe(false);
    expect(extension.trailingConfig).toBeNull();
  });

  it('activates trailing on the underlying trade once its tradeId is known, when trailingConfig was requested at creation', async () => {
    const trailingConfig = {
      strategy: TrailingStrategy.FIXED_POINTS,
      fixedPoints: 15,
    };
    const ownership = await ownershipService.create(
      buildParams({ trailingConfig }),
    );
    const handler = subscribers.get(OrderSubmittedEvent.EVENT_NAME);

    handler?.(new OrderSubmittedEvent(ownership.queueItemId, 'engine-trade-2'));
    await flushAsync();

    const extension = await tradeExtensionStore.get('engine-trade-2');
    expect(extension.trailingEnabled).toBe(true);
    expect(extension.trailingConfig).toEqual(trailingConfig);
  });

  it('still marks the ownership row OPEN with the tradeId, regardless of trailing config', async () => {
    const ownership = await ownershipService.create(buildParams());
    const handler = subscribers.get(OrderSubmittedEvent.EVENT_NAME);

    handler?.(new OrderSubmittedEvent(ownership.queueItemId, 'engine-trade-3'));
    await flushAsync();

    const updated = await ownershipService.requireOwned(ownership.id, 'user-1');
    expect(updated.status).toBe('OPEN');
    expect(updated.tradeId).toBe('engine-trade-3');
  });
});
