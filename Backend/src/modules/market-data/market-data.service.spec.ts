import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { MarketPriceUpdatedEvent } from '@shared/events/market-price-updated.event';
import { MarketDataService } from './market-data.service';
import { SubscriptionManager } from './subscription/subscription-manager';
import { MarketDataInstrument } from './models/market-data-instrument.model';
import { MarketDataConnectionState } from './models/market-data-connection-state.enum';
import { MarketDataProviderType } from './models/market-data-provider-type.enum';
import { Tick } from './models/tick.model';
import type { ReconnectOptions } from './models/reconnect-options.model';
import type { IMarketDataProvider } from './interfaces/market-data-provider.interface';
import { UnknownInstrumentSubscriptionException } from './exceptions/unknown-instrument-subscription.exception';
import {
  MarketDataConnectedEvent,
  MarketDataDisconnectedEvent,
  MarketDataReconnectingEvent,
  SubscriptionAddedEvent,
  SubscriptionRemovedEvent,
  HeartbeatReceivedEvent,
} from './events';
import { FakeTimerScheduler } from './testing/fake-timer-scheduler';
import { FakeClock } from './testing/fake-clock';

const NIFTY = new MarketDataInstrument('NFO', 'NIFTY24500CE', 'TOKEN-1');

class FakeMarketDataProvider implements IMarketDataProvider {
  connected = false;
  connectCalls = 0;
  reconnectCalls = 0;
  subscribeCalls: MarketDataInstrument[][] = [];
  unsubscribeCalls: string[][] = [];

  private tickHandler: ((tick: Tick) => void) | null = null;
  private heartbeatHandler: (() => void) | null = null;
  private stateHandler: ((state: MarketDataConnectionState) => void) | null =
    null;

  connect(): Promise<void> {
    this.connectCalls += 1;
    this.connected = true;
    this.stateHandler?.(MarketDataConnectionState.CONNECTED);
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    this.connected = false;
    this.stateHandler?.(MarketDataConnectionState.DISCONNECTED);
    return Promise.resolve();
  }

  subscribe(instruments: readonly MarketDataInstrument[]): Promise<void> {
    this.subscribeCalls.push([...instruments]);
    return Promise.resolve();
  }

  unsubscribe(instrumentTokens: readonly string[]): Promise<void> {
    this.unsubscribeCalls.push([...instrumentTokens]);
    return Promise.resolve();
  }

  reconnect(): Promise<void> {
    this.reconnectCalls += 1;
    this.stateHandler?.(MarketDataConnectionState.RECONNECTING);
    this.connected = true;
    this.stateHandler?.(MarketDataConnectionState.CONNECTED);
    return Promise.resolve();
  }

  isConnected(): boolean {
    return this.connected;
  }

  onTick(handler: (tick: Tick) => void): void {
    this.tickHandler = handler;
  }

  onHeartbeat(handler: () => void): void {
    this.heartbeatHandler = handler;
  }

  onConnectionStateChange(
    handler: (state: MarketDataConnectionState) => void,
  ): void {
    this.stateHandler = handler;
  }

  emitTick(tick: Tick): void {
    this.tickHandler?.(tick);
  }

  emitHeartbeat(): void {
    this.heartbeatHandler?.();
  }
}

function reconnectOptions(
  overrides: Partial<ReconnectOptions> = {},
): ReconnectOptions {
  return {
    baseDelayMs: 100,
    maxDelayMs: 1_000,
    maxRetries: 3,
    jitterRatio: 0,
    heartbeatTimeoutMs: 15_000,
    heartbeatCheckIntervalMs: 5_000,
    ...overrides,
  };
}

describe('MarketDataService', () => {
  // `provider` is the MOCK-slot fake — the service's default active
  // provider — and is what the pre-existing tests below drive directly.
  // `dhanProvider` is the DHAN-slot fake, only exercised by the dedicated
  // provider-switching tests further down.
  let provider: FakeMarketDataProvider;
  let dhanProvider: FakeMarketDataProvider;
  let eventBus: IEventBus;
  let publishSpy: jest.Mock;
  let clock: FakeClock;
  let scheduler: FakeTimerScheduler;
  let service: MarketDataService;

  beforeEach(() => {
    provider = new FakeMarketDataProvider();
    dhanProvider = new FakeMarketDataProvider();
    publishSpy = jest.fn();
    eventBus = {
      publish: publishSpy,
      subscribe: jest.fn(),
      subscribeToAll: jest.fn(),
    };
    clock = new FakeClock();
    scheduler = new FakeTimerScheduler();
    service = new MarketDataService(
      provider,
      dhanProvider,
      new SubscriptionManager(),
      eventBus,
      clock,
      scheduler,
      reconnectOptions(),
    );
    service.onModuleInit();
  });

  describe('lifecycle', () => {
    it('start() connects the provider and starts the heartbeat watchdog', async () => {
      await service.start();

      expect(provider.connectCalls).toBe(1);
      expect(scheduler.pendingIntervalCount()).toBe(1);
    });

    it('start() is idempotent', async () => {
      await service.start();
      await service.start();

      expect(provider.connectCalls).toBe(1);
    });

    it('stop() disconnects and clears the watchdog', async () => {
      await service.start();
      await service.stop();

      expect(provider.isConnected()).toBe(false);
      expect(scheduler.pendingIntervalCount()).toBe(0);
    });
  });

  describe('tick handling', () => {
    it('publishes MarketPriceUpdatedEvent for every tick, translated from the provider', async () => {
      await service.start();
      const tick = new Tick(
        'TOKEN-1',
        'NIFTY24500CE',
        'NFO',
        123.45,
        123.4,
        123.5,
        100,
        50,
        clock.now(),
        1,
      );

      provider.emitTick(tick);

      expect(publishSpy).toHaveBeenCalledWith(
        expect.objectContaining({ instrumentToken: 'TOKEN-1', price: 123.45 }),
      );
      const published = publishSpy.mock.calls
        .map(([e]: [unknown]) => e)
        .find((e) => e instanceof MarketPriceUpdatedEvent);
      expect(published).toBeDefined();
    });

    it('getLastTick returns null before any tick has arrived for that instrument', () => {
      expect(service.getLastTick('TOKEN-NEVER-TICKED')).toBeNull();
    });

    it('getLastTick returns the most recent tick — lets a late subscriber get an immediate snapshot instead of waiting for the next tick', async () => {
      await service.start();
      const first = new Tick(
        'TOKEN-1',
        'NIFTY24500CE',
        'NFO',
        123.45,
        123.4,
        123.5,
        100,
        50,
        clock.now(),
        1,
      );
      const second = new Tick(
        'TOKEN-1',
        'NIFTY24500CE',
        'NFO',
        176.0,
        175.9,
        176.1,
        100,
        50,
        clock.now(),
        2,
      );

      provider.emitTick(first);
      provider.emitTick(second);

      expect(service.getLastTick('TOKEN-1')).toBe(second);
    });
  });

  describe('subscription management', () => {
    it('subscribes the broker only for the first subscriber of an instrument', async () => {
      await service.subscribeInstrument(NIFTY, 'sub-1');
      await service.subscribeInstrument(NIFTY, 'sub-2');

      expect(provider.subscribeCalls).toHaveLength(1);
      expect(
        publishSpy.mock.calls.filter(
          ([e]: [unknown]) => e instanceof SubscriptionAddedEvent,
        ),
      ).toHaveLength(2);
    });

    it('unsubscribes the broker only once the last subscriber leaves', async () => {
      await service.subscribeInstrument(NIFTY, 'sub-1');
      await service.subscribeInstrument(NIFTY, 'sub-2');

      await service.unsubscribeInstrument('TOKEN-1', 'sub-1');
      expect(provider.unsubscribeCalls).toHaveLength(0);

      await service.unsubscribeInstrument('TOKEN-1', 'sub-2');
      expect(provider.unsubscribeCalls).toEqual([['TOKEN-1']]);
      expect(
        publishSpy.mock.calls.filter(
          ([e]: [unknown]) => e instanceof SubscriptionRemovedEvent,
        ),
      ).toHaveLength(2);
    });

    it('getSubscriberCount throws for an instrument with no active subscription', () => {
      expect(() => service.getSubscriberCount('UNKNOWN')).toThrow(
        UnknownInstrumentSubscriptionException,
      );
    });

    it('getSubscriberCount returns the current count for a subscribed instrument', async () => {
      await service.subscribeInstrument(NIFTY, 'sub-1');
      await service.subscribeInstrument(NIFTY, 'sub-2');
      expect(service.getSubscriberCount('TOKEN-1')).toBe(2);
    });
  });

  describe('connection events', () => {
    it('publishes MarketDataConnectedEvent when the provider connects', async () => {
      await service.start();
      expect(
        publishSpy.mock.calls.some(
          ([e]: [unknown]) => e instanceof MarketDataConnectedEvent,
        ),
      ).toBe(true);
    });

    it('publishes MarketDataDisconnectedEvent when the provider disconnects', async () => {
      await service.start();
      await service.stop();
      expect(
        publishSpy.mock.calls.some(
          ([e]: [unknown]) => e instanceof MarketDataDisconnectedEvent,
        ),
      ).toBe(true);
    });

    it('publishes MarketDataReconnectingEvent with an incrementing attempt number', async () => {
      await service.start();
      await provider.reconnect();
      await provider.reconnect();

      const reconnectEvents = publishSpy.mock.calls
        .map(([e]: [unknown]) => e)
        .filter(
          (e): e is MarketDataReconnectingEvent =>
            e instanceof MarketDataReconnectingEvent,
        );

      expect(reconnectEvents.map((e) => e.attempt)).toEqual([1, 1]);
    });

    it('publishes HeartbeatReceivedEvent when the provider emits a heartbeat', async () => {
      await service.start();
      provider.emitHeartbeat();

      expect(
        publishSpy.mock.calls.some(
          ([e]: [unknown]) => e instanceof HeartbeatReceivedEvent,
        ),
      ).toBe(true);
    });
  });

  describe('health reporting', () => {
    it('reports providerType, connection state, and subscriptionsCount', async () => {
      await service.start();
      await service.subscribeInstrument(NIFTY, 'sub-1');

      const health = service.getHealth();

      expect(health.providerType).toBe(MarketDataProviderType.MOCK);
      expect(health.state).toBe(MarketDataConnectionState.CONNECTED);
      expect(health.connected).toBe(true);
      expect(health.subscriptionsCount).toBe(1);
    });

    it('reports heartbeatAgeMs as null before any heartbeat has ever been seeded', () => {
      const health = service.getHealth();
      expect(health.heartbeatAgeMs).toBeNull();
    });

    it('computes latencyMs from the difference between receipt time and tick timestamp', async () => {
      await service.start();
      const tickTimestamp = new Date(clock.now().getTime() - 250);
      provider.emitTick(
        new Tick(
          'TOKEN-1',
          'NIFTY24500CE',
          'NFO',
          100,
          99.9,
          100.1,
          0,
          0,
          tickTimestamp,
          1,
        ),
      );

      const health = service.getHealth();
      expect(health.latencyMs).toBeGreaterThanOrEqual(250);
    });
  });

  describe('heartbeat staleness watchdog', () => {
    it('reconnects when no heartbeat has been seen within the timeout', async () => {
      const shortTimeoutService = new MarketDataService(
        provider,
        dhanProvider,
        new SubscriptionManager(),
        eventBus,
        clock,
        scheduler,
        reconnectOptions({
          heartbeatTimeoutMs: 1_000,
          heartbeatCheckIntervalMs: 500,
        }),
      );
      shortTimeoutService.onModuleInit();
      await shortTimeoutService.start();

      clock.advanceBy(2_000);
      scheduler.fireAllIntervals();

      expect(provider.reconnectCalls).toBe(1);
    });

    it('does not reconnect while heartbeats are arriving within the timeout', async () => {
      const shortTimeoutService = new MarketDataService(
        provider,
        dhanProvider,
        new SubscriptionManager(),
        eventBus,
        clock,
        scheduler,
        reconnectOptions({
          heartbeatTimeoutMs: 10_000,
          heartbeatCheckIntervalMs: 500,
        }),
      );
      shortTimeoutService.onModuleInit();
      await shortTimeoutService.start();

      clock.advanceBy(1_000);
      scheduler.fireAllIntervals();

      expect(provider.reconnectCalls).toBe(0);
    });
  });

  describe('provider switching (initializeForMode/prepare/commit/abort)', () => {
    it('defaults to MOCK until initializeForMode is called', async () => {
      await service.start();
      expect(provider.connectCalls).toBe(1);
      expect(dhanProvider.connectCalls).toBe(0);
    });

    it('initializeForMode sets the initial active provider before anything connects', async () => {
      service.initializeForMode('LIVE');
      await service.start();

      expect(dhanProvider.connectCalls).toBe(1);
      expect(provider.connectCalls).toBe(0);
    });

    it('prepareProviderForMode connects the target provider without touching the currently active one', async () => {
      await service.start();

      await service.prepareProviderForMode('LIVE');

      expect(dhanProvider.connectCalls).toBe(1);
      expect(provider.isConnected()).toBe(true);
      expect(dhanProvider.isConnected()).toBe(true);
      // Ticks from the not-yet-committed target must not surface yet.
      dhanProvider.emitHeartbeat();
      expect(
        publishSpy.mock.calls.some(
          ([e]: [unknown]) => e instanceof HeartbeatReceivedEvent,
        ),
      ).toBe(false);
    });

    it('prepareProviderForMode replays current subscriptions onto the target provider', async () => {
      await service.start();
      await service.subscribeInstrument(NIFTY, 'sub-1');

      await service.prepareProviderForMode('LIVE');

      expect(dhanProvider.subscribeCalls).toHaveLength(1);
      expect(dhanProvider.subscribeCalls[0]?.[0]?.instrumentToken).toBe(
        'TOKEN-1',
      );
    });

    it('commitProviderSwitch flips the active provider and disconnects the previous one', async () => {
      await service.start();
      await service.prepareProviderForMode('LIVE');

      await service.commitProviderSwitch('LIVE');

      expect(provider.isConnected()).toBe(false);
      expect(dhanProvider.isConnected()).toBe(true);
      expect(service.getHealth().providerType).toBe(
        MarketDataProviderType.DHAN,
      );
    });

    it('after commit, only the newly active provider drives ticks/heartbeats/state', async () => {
      await service.start();
      await service.prepareProviderForMode('LIVE');
      await service.commitProviderSwitch('LIVE');
      publishSpy.mockClear();

      dhanProvider.emitHeartbeat();
      expect(
        publishSpy.mock.calls.some(
          ([e]: [unknown]) => e instanceof HeartbeatReceivedEvent,
        ),
      ).toBe(true);

      publishSpy.mockClear();
      provider.emitHeartbeat();
      expect(
        publishSpy.mock.calls.some(
          ([e]: [unknown]) => e instanceof HeartbeatReceivedEvent,
        ),
      ).toBe(false);
    });

    it('abortPreparedProvider disconnects whatever prepare connected, leaving the active provider untouched', async () => {
      await service.start();
      await service.prepareProviderForMode('LIVE');

      await service.abortPreparedProvider('LIVE');

      expect(dhanProvider.isConnected()).toBe(false);
      expect(provider.isConnected()).toBe(true);
      expect(service.getHealth().providerType).toBe(
        MarketDataProviderType.MOCK,
      );
    });

    it('prepare/commit are no-ops when the target mode is already active', async () => {
      await service.start();

      await service.prepareProviderForMode('PAPER');
      await service.commitProviderSwitch('PAPER');

      expect(dhanProvider.connectCalls).toBe(0);
      expect(provider.connectCalls).toBe(1);
    });

    it('survives 200 repeated PAPER<->LIVE switches with exactly one active provider connected at a time and no leaked intervals', async () => {
      await service.start();
      let mode: 'PAPER' | 'LIVE' = 'PAPER';

      for (let i = 0; i < 200; i += 1) {
        mode = mode === 'PAPER' ? 'LIVE' : 'PAPER';
        await service.prepareProviderForMode(mode);
        await service.commitProviderSwitch(mode);

        const expectedActive = mode === 'LIVE' ? dhanProvider : provider;
        const expectedInactive = mode === 'LIVE' ? provider : dhanProvider;
        expect(expectedActive.isConnected()).toBe(true);
        expect(expectedInactive.isConnected()).toBe(false);
      }

      // Exactly one watchdog interval alive throughout, never accumulating.
      expect(scheduler.pendingIntervalCount()).toBe(1);
    });
  });
});
