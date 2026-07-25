import { MockMarketDataProvider } from './mock-market-data.provider';
import type { MockMarketDataProviderOptions } from './mock-market-data-provider.options';
import { MarketDataInstrument } from '../../models/market-data-instrument.model';
import { MarketDataConnectionState } from '../../models/market-data-connection-state.enum';
import { MarketDataProviderException } from '../../exceptions/market-data-provider.exception';
import { FakeTimerScheduler } from '../../testing/fake-timer-scheduler';
import { FakeClock } from '../../testing/fake-clock';

function deterministicOptions(
  overrides: Partial<MockMarketDataProviderOptions> = {},
): MockMarketDataProviderOptions {
  return {
    tickIntervalMs: 1_000,
    volatility: 0.001,
    deterministic: true,
    heartbeatIntervalMs: 5_000,
    ...overrides,
  };
}

const NIFTY = new MarketDataInstrument('NFO', 'NIFTY24500CE', 'TOKEN-1');
const BANKNIFTY = new MarketDataInstrument(
  'NFO',
  'BANKNIFTY48000CE',
  'TOKEN-2',
);

describe('MockMarketDataProvider', () => {
  describe('connection lifecycle', () => {
    it('starts DISCONNECTED and becomes CONNECTED after connect()', async () => {
      const provider = new MockMarketDataProvider(
        deterministicOptions(),
        new FakeTimerScheduler(),
        new FakeClock(),
      );
      expect(provider.isConnected()).toBe(false);

      await provider.connect();

      expect(provider.isConnected()).toBe(true);
    });

    it('notifies onConnectionStateChange for every transition', async () => {
      const provider = new MockMarketDataProvider(
        deterministicOptions(),
        new FakeTimerScheduler(),
        new FakeClock(),
      );
      const states: MarketDataConnectionState[] = [];
      provider.onConnectionStateChange((state) => states.push(state));

      await provider.connect();
      await provider.disconnect();

      expect(states).toEqual([
        MarketDataConnectionState.CONNECTED,
        MarketDataConnectionState.DISCONNECTED,
      ]);
    });

    it('reconnect() transitions through RECONNECTING back to CONNECTED', async () => {
      const provider = new MockMarketDataProvider(
        deterministicOptions(),
        new FakeTimerScheduler(),
        new FakeClock(),
      );
      const states: MarketDataConnectionState[] = [];
      provider.onConnectionStateChange((state) => states.push(state));
      await provider.connect();

      await provider.reconnect();

      expect(states).toEqual([
        MarketDataConnectionState.CONNECTED,
        MarketDataConnectionState.RECONNECTING,
        MarketDataConnectionState.CONNECTED,
      ]);
      expect(provider.isConnected()).toBe(true);
    });
  });

  describe('deterministic mode', () => {
    it('never starts a real timer', async () => {
      const scheduler = new FakeTimerScheduler();
      const provider = new MockMarketDataProvider(
        deterministicOptions(),
        scheduler,
        new FakeClock(),
      );

      await provider.connect();

      expect(scheduler.pendingIntervalCount()).toBe(0);
    });

    it('emits a manually-triggered tick with a normalized shape', async () => {
      const provider = new MockMarketDataProvider(
        deterministicOptions(),
        new FakeTimerScheduler(),
        new FakeClock(),
      );
      await provider.connect();
      await provider.subscribe([NIFTY]);
      const ticks: unknown[] = [];
      provider.onTick((tick) => ticks.push(tick));

      provider.emitDeterministicTick('TOKEN-1', 123.45);

      expect(ticks).toHaveLength(1);
      const tick = ticks[0] as {
        instrumentToken: string;
        tradingSymbol: string;
        exchange: string;
        lastPrice: number;
        sequenceNumber: number;
      };
      expect(tick.instrumentToken).toBe('TOKEN-1');
      expect(tick.tradingSymbol).toBe('NIFTY24500CE');
      expect(tick.exchange).toBe('NFO');
      expect(tick.lastPrice).toBe(123.45);
      expect(tick.sequenceNumber).toBe(1);
    });

    it('increments sequenceNumber across multiple ticks', async () => {
      const provider = new MockMarketDataProvider(
        deterministicOptions(),
        new FakeTimerScheduler(),
        new FakeClock(),
      );
      await provider.connect();
      await provider.subscribe([NIFTY]);
      const ticks: { sequenceNumber: number }[] = [];
      provider.onTick((tick) => ticks.push(tick));

      provider.emitDeterministicTick('TOKEN-1', 100);
      provider.emitDeterministicTick('TOKEN-1', 101);
      provider.emitDeterministicTick('TOKEN-1', 102);

      expect(ticks.map((t) => t.sequenceNumber)).toEqual([1, 2, 3]);
    });

    it('throws MarketDataProviderException when emitting a tick for an unsubscribed instrument', async () => {
      const provider = new MockMarketDataProvider(
        deterministicOptions(),
        new FakeTimerScheduler(),
        new FakeClock(),
      );
      await provider.connect();

      expect(() => provider.emitDeterministicTick('UNKNOWN', 100)).toThrow(
        MarketDataProviderException,
      );
    });

    it('supports multiple instruments independently', async () => {
      const provider = new MockMarketDataProvider(
        deterministicOptions(),
        new FakeTimerScheduler(),
        new FakeClock(),
      );
      await provider.connect();
      await provider.subscribe([NIFTY, BANKNIFTY]);
      const ticks: { instrumentToken: string; lastPrice: number }[] = [];
      provider.onTick((tick) => ticks.push(tick));

      provider.emitDeterministicTick('TOKEN-1', 100);
      provider.emitDeterministicTick('TOKEN-2', 200);

      expect(ticks).toEqual([
        expect.objectContaining({ instrumentToken: 'TOKEN-1', lastPrice: 100 }),
        expect.objectContaining({ instrumentToken: 'TOKEN-2', lastPrice: 200 }),
      ]);
    });

    it('emits heartbeats only when manually triggered', async () => {
      const provider = new MockMarketDataProvider(
        deterministicOptions(),
        new FakeTimerScheduler(),
        new FakeClock(),
      );
      const heartbeats: number[] = [];
      provider.onHeartbeat(() => heartbeats.push(1));
      await provider.connect();

      expect(heartbeats).toHaveLength(0);
      provider.emitDeterministicHeartbeat();
      expect(heartbeats).toHaveLength(1);
    });

    it('unsubscribe stops future ticks for that instrument', async () => {
      const provider = new MockMarketDataProvider(
        deterministicOptions(),
        new FakeTimerScheduler(),
        new FakeClock(),
      );
      await provider.connect();
      await provider.subscribe([NIFTY]);
      await provider.unsubscribe(['TOKEN-1']);

      expect(() => provider.emitDeterministicTick('TOKEN-1', 100)).toThrow(
        MarketDataProviderException,
      );
    });
  });

  describe('live (non-deterministic) mode', () => {
    it('starts a tick interval and a heartbeat interval on connect via the scheduler', async () => {
      const scheduler = new FakeTimerScheduler();
      const provider = new MockMarketDataProvider(
        deterministicOptions({ deterministic: false }),
        scheduler,
        new FakeClock(),
      );

      await provider.connect();

      expect(scheduler.pendingIntervalCount()).toBe(2);
    });

    it('generates a realistic tick within the volatility bound when the interval fires', async () => {
      const scheduler = new FakeTimerScheduler();
      const provider = new MockMarketDataProvider(
        deterministicOptions({
          deterministic: false,
          volatility: 0.01,
          basePrices: { 'TOKEN-1': 100 },
        }),
        scheduler,
        new FakeClock(),
      );
      await provider.connect();
      await provider.subscribe([NIFTY]);
      const ticks: { lastPrice: number }[] = [];
      provider.onTick((tick) => ticks.push(tick));

      scheduler.fireAllIntervals();

      expect(ticks).toHaveLength(1);
      expect(ticks[0].lastPrice).toBeGreaterThan(98);
      expect(ticks[0].lastPrice).toBeLessThan(102);
    });

    it('stops the timers on disconnect', async () => {
      const scheduler = new FakeTimerScheduler();
      const provider = new MockMarketDataProvider(
        deterministicOptions({ deterministic: false }),
        scheduler,
        new FakeClock(),
      );
      await provider.connect();

      await provider.disconnect();

      expect(scheduler.pendingIntervalCount()).toBe(0);
    });
  });
});
