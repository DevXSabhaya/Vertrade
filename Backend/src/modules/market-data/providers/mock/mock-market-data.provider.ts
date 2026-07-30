import { Inject, Injectable } from '@nestjs/common';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { TIMER_SCHEDULER } from '@shared/scheduler/timer-scheduler.constants';
import type { ITimerScheduler } from '@shared/scheduler/timer-scheduler.interface';
import type { IMarketDataProvider } from '../../interfaces/market-data-provider.interface';
import { Tick } from '../../models/tick.model';
import type { MarketDataInstrument } from '../../models/market-data-instrument.model';
import { MarketDataConnectionState } from '../../models/market-data-connection-state.enum';
import { MarketDataProviderException } from '../../exceptions/market-data-provider.exception';
import { MOCK_MARKET_DATA_OPTIONS } from './mock-market-data-provider.constants';
import type { MockMarketDataProviderOptions } from './mock-market-data-provider.options';

/**
 * Fully in-memory simulated feed — no Dhan credentials, no real network,
 * ever. Deterministic mode disables all timers so unit tests can trigger
 * ticks/heartbeats manually and get fully reproducible results; live mode
 * runs a real setInterval-driven random walk per subscribed instrument via
 * the injected ITimerScheduler, so production behavior is still swappable
 * for tests without conditionals scattered through this class.
 */
@Injectable()
export class MockMarketDataProvider implements IMarketDataProvider {
  private state = MarketDataConnectionState.DISCONNECTED;
  private readonly instruments = new Map<string, MarketDataInstrument>();
  private readonly lastPrices = new Map<string, number>();
  private sequence = 0;
  private tickTimerHandle: unknown = null;
  private heartbeatTimerHandle: unknown = null;

  private tickHandler: ((tick: Tick) => void) | null = null;
  private heartbeatHandler: (() => void) | null = null;
  private connectionStateHandler:
    ((state: MarketDataConnectionState) => void) | null = null;

  constructor(
    @Inject(MOCK_MARKET_DATA_OPTIONS)
    private readonly options: MockMarketDataProviderOptions,
    @Inject(TIMER_SCHEDULER) private readonly scheduler: ITimerScheduler,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await -- kept async to match IMarketDataProvider; nothing here needs to await
  async connect(): Promise<void> {
    this.setState(MarketDataConnectionState.CONNECTED);
    if (!this.options.deterministic) {
      this.tickTimerHandle = this.scheduler.setInterval(
        () => this.tickAllSubscribed(),
        this.options.tickIntervalMs,
      );
      this.heartbeatTimerHandle = this.scheduler.setInterval(
        () => this.emitHeartbeat(),
        this.options.heartbeatIntervalMs,
      );
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- see connect()
  async disconnect(): Promise<void> {
    this.clearTimers();
    this.setState(MarketDataConnectionState.DISCONNECTED);
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- see connect()
  async subscribe(instruments: readonly MarketDataInstrument[]): Promise<void> {
    for (const instrument of instruments) {
      this.instruments.set(instrument.instrumentToken, instrument);
      if (!this.lastPrices.has(instrument.instrumentToken)) {
        this.lastPrices.set(
          instrument.instrumentToken,
          this.options.basePrices?.[instrument.instrumentToken] ?? 100,
        );
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- see connect()
  async unsubscribe(instrumentTokens: readonly string[]): Promise<void> {
    for (const token of instrumentTokens) {
      this.instruments.delete(token);
      this.lastPrices.delete(token);
    }
  }

  async reconnect(): Promise<void> {
    this.clearTimers();
    this.setState(MarketDataConnectionState.RECONNECTING);
    await this.connect();
  }

  isConnected(): boolean {
    return this.state === MarketDataConnectionState.CONNECTED;
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
    this.connectionStateHandler = handler;
  }

  /**
   * Deterministic-mode test hook: emits one tick for an already-subscribed
   * instrument at an explicit price, with no timer and no randomness
   * involved.
   */
  emitDeterministicTick(
    instrumentToken: string,
    lastPrice: number,
    overrides: {
      bid?: number;
      ask?: number;
      volume?: number;
      openInterest?: number;
    } = {},
  ): void {
    const instrument = this.instruments.get(instrumentToken);
    if (!instrument) {
      throw new MarketDataProviderException(
        `Cannot emit a tick for unsubscribed instrument ${instrumentToken}`,
      );
    }
    this.lastPrices.set(instrumentToken, lastPrice);
    this.emitTickFor(instrument, lastPrice, overrides);
  }

  /** Deterministic-mode test hook: emits a heartbeat with no timer involved. */
  emitDeterministicHeartbeat(): void {
    this.emitHeartbeat();
  }

  private tickAllSubscribed(): void {
    for (const [token, instrument] of this.instruments) {
      const previous = this.lastPrices.get(token) ?? 100;
      const delta =
        previous * this.options.volatility * (Math.random() * 2 - 1);
      const next = Math.max(0.05, previous + delta);
      this.lastPrices.set(token, next);
      this.emitTickFor(instrument, next);
    }
  }

  private emitTickFor(
    instrument: MarketDataInstrument,
    lastPrice: number,
    overrides: {
      bid?: number;
      ask?: number;
      volume?: number;
      openInterest?: number;
    } = {},
  ): void {
    this.sequence += 1;
    const tick = new Tick(
      instrument.instrumentToken,
      instrument.tradingSymbol,
      instrument.exchange,
      lastPrice,
      overrides.bid ?? Math.max(0.05, lastPrice - 0.05),
      overrides.ask ?? lastPrice + 0.05,
      overrides.volume ?? 0,
      overrides.openInterest ?? 0,
      this.clock.now(),
      this.sequence,
    );
    this.tickHandler?.(tick);
  }

  private emitHeartbeat(): void {
    this.heartbeatHandler?.();
  }

  private setState(state: MarketDataConnectionState): void {
    this.state = state;
    this.connectionStateHandler?.(state);
  }

  private clearTimers(): void {
    if (this.tickTimerHandle !== null) {
      this.scheduler.clearInterval(this.tickTimerHandle);
      this.tickTimerHandle = null;
    }
    if (this.heartbeatTimerHandle !== null) {
      this.scheduler.clearInterval(this.heartbeatTimerHandle);
      this.heartbeatTimerHandle = null;
    }
  }
}
