import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { TIMER_SCHEDULER } from '@shared/scheduler/timer-scheduler.constants';
import type { ITimerScheduler } from '@shared/scheduler/timer-scheduler.interface';
import { MarketPriceUpdatedEvent } from '@shared/events/market-price-updated.event';
import type { TradingMode } from '@modules/trading-engine/domain/trading-mode.type';
import type { IMarketDataProvider } from './interfaces/market-data-provider.interface';
import type { Tick } from './models/tick.model';
import type { MarketDataInstrument } from './models/market-data-instrument.model';
import { MarketDataConnectionState } from './models/market-data-connection-state.enum';
import { MarketDataProviderType } from './models/market-data-provider-type.enum';
import type { MarketDataHealth } from './models/market-data-health.model';
import type { ReconnectOptions } from './models/reconnect-options.model';
import {
  MOCK_MARKET_DATA_PROVIDER,
  DHAN_MARKET_DATA_PROVIDER,
  MARKET_DATA_RECONNECT_OPTIONS,
} from './market-data-provider.constants';
import { SubscriptionManager } from './subscription/subscription-manager';
import { UnknownInstrumentSubscriptionException } from './exceptions/unknown-instrument-subscription.exception';
import {
  MarketDataConnectedEvent,
  MarketDataDisconnectedEvent,
  MarketDataReconnectingEvent,
  SubscriptionAddedEvent,
  SubscriptionRemovedEvent,
  HeartbeatReceivedEvent,
} from './events';

import { BrokerLoginSucceededEvent } from '@modules/broker/broker-auth/events/broker-login-succeeded.event';
import { BrokerLogoutCompletedEvent } from '@modules/broker/broker-auth/events/broker-logout-completed.event';
import { BrokerSessionExpiredException } from '@modules/broker/broker-auth/exceptions/broker-session-expired.exception';

/**
 * The single owner of market data, and the single owner of PAPER/LIVE
 * provider switching. Both MockMarketDataProvider and DhanMarketDataProvider
 * are constructed once at boot (ordinary Nest singletons) and their event
 * handlers are wired exactly once, here, permanently — there is no
 * "rewiring" on a mode switch. Only one of the two is ever actually
 * `connect()`-ed at a time; the other sits idle. Tick/heartbeat/state events
 * from whichever provider is NOT currently active are ignored (guarded by
 * `sourceType === this.activeProviderType`), so a provider mid-teardown
 * (still emitting its own DISCONNECTED transition) can never corrupt the
 * health state of the provider that has already taken over.
 *
 * Provider selection is driven exclusively by TradingModeService (via
 * `initializeForMode`/`prepareProviderForMode`/`commitProviderSwitch`/
 * `abortPreparedProvider`) — never by an env var read at DI-graph-build
 * time. This service does NOT depend on TradingModeService (that would be
 * a circular module dependency, since TradingModeModule depends on this
 * module); TradingModeService calls in, this service never calls out.
 */
@Injectable()
export class MarketDataService implements OnModuleInit, OnModuleDestroy {
  private activeProviderType: MarketDataProviderType =
    MarketDataProviderType.MOCK;
  private connectionState = MarketDataConnectionState.DISCONNECTED;
  private lastHeartbeatAt: Date | null = null;
  private lastTickReceivedAt: Date | null = null;
  private lastTickTimestamp: Date | null = null;
  private reconnectEventCount = 0;
  private watchdogHandle: unknown = null;
  private started = false;
  // Keyed by instrumentToken — lets a client that subscribes after ticks have
  // already started flowing receive an immediate snapshot instead of waiting
  // indefinitely for the next one (RealtimeGateway.handleSubscribeInstrument
  // is this getter's only external caller).
  private readonly lastTickByInstrument = new Map<string, Tick>();

  constructor(
    @Inject(MOCK_MARKET_DATA_PROVIDER)
    private readonly mockProvider: IMarketDataProvider,
    @Inject(DHAN_MARKET_DATA_PROVIDER)
    private readonly dhanProvider: IMarketDataProvider,
    private readonly subscriptionManager: SubscriptionManager,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(CLOCK) private readonly clock: IClock,
    @Inject(TIMER_SCHEDULER) private readonly scheduler: ITimerScheduler,
    @Inject(MARKET_DATA_RECONNECT_OPTIONS)
    private readonly reconnectOptions: ReconnectOptions,
  ) {}

  onModuleInit(): void {
    this.wireHandlers(this.mockProvider, MarketDataProviderType.MOCK);
    this.wireHandlers(this.dhanProvider, MarketDataProviderType.DHAN);

    this.eventBus.subscribe<BrokerLoginSucceededEvent>(
      'broker.login.succeeded',
      () => {
        void this.handleBrokerLogin();
      },
    );

    this.eventBus.subscribe<BrokerLogoutCompletedEvent>(
      'broker.logout.completed',
      () => {
        void this.handleBrokerLogout();
      },
    );
  }

  private async handleBrokerLogin(): Promise<void> {
    if (this.started && this.activeProviderType === MarketDataProviderType.DHAN) {
      if (!this.activeProvider().isConnected()) {
        await this.activeProvider().connect().catch(() => undefined);
      }
    }
  }

  private async handleBrokerLogout(): Promise<void> {
    if (this.activeProviderType === MarketDataProviderType.DHAN) {
      await this.activeProvider().disconnect().catch(() => undefined);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.clearWatchdog();
    if (this.started) {
      await this.activeProvider().disconnect();
    }
  }

  /**
   * Sets the initial active provider from the persisted trading mode,
   * before anything has connected. Called once, synchronously, by
   * TradingModeService's OnApplicationBootstrap hook — Nest runs every
   * module's onModuleInit before any module's onApplicationBootstrap, so
   * this always runs after this service's own onModuleInit (default: MOCK)
   * and before main.ts's post-listen warm-up / any explicit start().
   */
  initializeForMode(mode: TradingMode): void {
    this.activeProviderType = this.typeForMode(mode);
  }

  /**
   * Prepare phase of an atomic mode switch: connects the target provider
   * (if it isn't already active) and replays current subscriptions onto it,
   * WITHOUT touching the currently active provider or flipping which one is
   * "active" — invisible to every consumer until commitProviderSwitch runs.
   */
  async prepareProviderForMode(mode: TradingMode): Promise<void> {
    const targetType = this.typeForMode(mode);
    if (targetType === this.activeProviderType || !this.started) {
      return;
    }
    const target = this.providerOfType(targetType);
    try {
      await target.connect();
    } catch (error) {
      if (error instanceof BrokerSessionExpiredException) {
        // Swallow it! The provider remains disconnected until reauth happens.
        return;
      }
      throw error;
    }
    const instruments = this.subscriptionManager.getSubscribedInstruments();
    if (instruments.length > 0) {
      await target.subscribe(instruments);
    }
  }

  /**
   * Commit phase: flips the active pointer and tears down the previously
   * active provider. The target provider is already connected (from
   * prepare) if this service is started — so there is no gap where no
   * provider is serving.
   */
  async commitProviderSwitch(mode: TradingMode): Promise<void> {
    const targetType = this.typeForMode(mode);
    if (targetType === this.activeProviderType) {
      return;
    }
    const previous = this.activeProvider();
    this.activeProviderType = targetType;
    if (this.started) {
      this.clearWatchdog();
      await previous.disconnect().catch(() => undefined);
      this.connectionState = this.activeProvider().isConnected()
        ? MarketDataConnectionState.CONNECTED
        : MarketDataConnectionState.DISCONNECTED;
      this.startHeartbeatWatchdog();
    }
  }

  /** Failure path for the prepare phase: disconnects whatever was connected in prepare, leaving the active provider untouched. */
  async abortPreparedProvider(mode: TradingMode): Promise<void> {
    const targetType = this.typeForMode(mode);
    if (targetType === this.activeProviderType || !this.started) {
      return;
    }
    await this.providerOfType(targetType)
      .disconnect()
      .catch(() => undefined);
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;
    await this.activeProvider().connect();
    this.startHeartbeatWatchdog();
  }

  async stop(): Promise<void> {
    this.clearWatchdog();
    await this.activeProvider().disconnect();
    this.started = false;
  }

  async subscribeInstrument(
    instrument: MarketDataInstrument,
    subscriberId: string,
  ): Promise<void> {
    const { isNewInstrument } = this.subscriptionManager.addSubscriber(
      instrument,
      subscriberId,
    );
    if (isNewInstrument) {
      await this.activeProvider().subscribe([instrument]);
    }
    this.eventBus.publish(
      new SubscriptionAddedEvent(instrument.instrumentToken, subscriberId),
    );
  }

  async unsubscribeInstrument(
    instrumentToken: string,
    subscriberId: string,
  ): Promise<void> {
    const { isFullyUnsubscribed } = this.subscriptionManager.removeSubscriber(
      instrumentToken,
      subscriberId,
    );
    if (isFullyUnsubscribed) {
      await this.activeProvider().unsubscribe([instrumentToken]);
    }
    this.eventBus.publish(
      new SubscriptionRemovedEvent(instrumentToken, subscriberId),
    );
  }

  /** Last tick observed for this instrument, or null if none has arrived since this process started (or ever, for an instrument nobody has subscribed to yet). */
  getLastTick(instrumentToken: string): Tick | null {
    return this.lastTickByInstrument.get(instrumentToken) ?? null;
  }

  getSubscriberCount(instrumentToken: string): number {
    if (!this.subscriptionManager.isSubscribed(instrumentToken)) {
      throw new UnknownInstrumentSubscriptionException(
        `No active subscription for instrument ${instrumentToken}`,
      );
    }
    return this.subscriptionManager.getSubscriberCount(instrumentToken);
  }

  getHealth(): MarketDataHealth {
    const now = this.clock.now();
    return {
      providerType: this.activeProviderType,
      state: this.connectionState,
      connected: this.activeProvider().isConnected(),
      latencyMs:
        this.lastTickReceivedAt && this.lastTickTimestamp
          ? this.lastTickReceivedAt.getTime() - this.lastTickTimestamp.getTime()
          : null,
      heartbeatAgeMs: this.lastHeartbeatAt
        ? now.getTime() - this.lastHeartbeatAt.getTime()
        : null,
      subscriptionsCount: this.subscriptionManager.count(),
    };
  }

  private wireHandlers(
    provider: IMarketDataProvider,
    type: MarketDataProviderType,
  ): void {
    provider.onTick((tick) => this.handleTick(tick, type));
    provider.onHeartbeat(() => this.handleHeartbeat(type));
    provider.onConnectionStateChange((state) =>
      this.handleConnectionStateChange(state, type),
    );
  }

  private handleTick(tick: Tick, sourceType: MarketDataProviderType): void {
    if (sourceType !== this.activeProviderType) {
      return;
    }
    this.lastTickReceivedAt = this.clock.now();
    this.lastTickTimestamp = tick.timestamp;
    this.lastTickByInstrument.set(tick.instrumentToken, tick);
    this.eventBus.publish(
      new MarketPriceUpdatedEvent(tick.instrumentToken, tick.lastPrice),
    );
  }

  private handleHeartbeat(sourceType: MarketDataProviderType): void {
    if (sourceType !== this.activeProviderType) {
      return;
    }
    this.lastHeartbeatAt = this.clock.now();
    this.eventBus.publish(new HeartbeatReceivedEvent(sourceType));
  }

  private handleConnectionStateChange(
    state: MarketDataConnectionState,
    sourceType: MarketDataProviderType,
  ): void {
    if (sourceType !== this.activeProviderType) {
      return;
    }
    this.connectionState = state;

    if (state === MarketDataConnectionState.CONNECTED) {
      this.reconnectEventCount = 0;
      this.lastHeartbeatAt = this.clock.now();
      this.eventBus.publish(new MarketDataConnectedEvent(sourceType));
    } else if (state === MarketDataConnectionState.DISCONNECTED) {
      this.eventBus.publish(new MarketDataDisconnectedEvent(sourceType));
    } else if (state === MarketDataConnectionState.RECONNECTING) {
      this.reconnectEventCount += 1;
      this.eventBus.publish(
        new MarketDataReconnectingEvent(sourceType, this.reconnectEventCount),
      );
    }
  }

  private startHeartbeatWatchdog(): void {
    this.lastHeartbeatAt = this.clock.now();
    this.watchdogHandle = this.scheduler.setInterval(
      () => this.checkHeartbeatStaleness(),
      this.reconnectOptions.heartbeatCheckIntervalMs,
    );
  }

  private checkHeartbeatStaleness(): void {
    if (!this.activeProvider().isConnected() || this.lastHeartbeatAt === null) {
      return;
    }
    const age = this.clock.now().getTime() - this.lastHeartbeatAt.getTime();
    if (age > this.reconnectOptions.heartbeatTimeoutMs) {
      this.activeProvider()
        .reconnect()
        .catch(() => undefined);
    }
  }

  private clearWatchdog(): void {
    if (this.watchdogHandle !== null) {
      this.scheduler.clearInterval(this.watchdogHandle);
      this.watchdogHandle = null;
    }
  }

  private typeForMode(mode: TradingMode): MarketDataProviderType {
    return mode === 'LIVE'
      ? MarketDataProviderType.DHAN
      : MarketDataProviderType.MOCK;
  }

  private providerOfType(type: MarketDataProviderType): IMarketDataProvider {
    return type === MarketDataProviderType.DHAN
      ? this.dhanProvider
      : this.mockProvider;
  }

  private activeProvider(): IMarketDataProvider {
    return this.providerOfType(this.activeProviderType);
  }
}
