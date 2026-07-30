import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { ConfigService } from '@core/config/config.service';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { TIMER_SCHEDULER } from '@shared/scheduler/timer-scheduler.constants';
import type { ITimerScheduler } from '@shared/scheduler/timer-scheduler.interface';
import { MarketPriceUpdatedEvent } from '@shared/events/market-price-updated.event';
import type { IMarketDataProvider } from './interfaces/market-data-provider.interface';
import type { Tick } from './models/tick.model';
import type { MarketDataInstrument } from './models/market-data-instrument.model';
import { MarketDataConnectionState } from './models/market-data-connection-state.enum';
import { MarketDataProviderType } from './models/market-data-provider-type.enum';
import type { MarketDataHealth } from './models/market-data-health.model';
import type { ReconnectOptions } from './models/reconnect-options.model';
import {
  MARKET_DATA_PROVIDER,
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

/**
 * The single owner of market data. The Trading Engine never imports this
 * service, IMarketDataProvider, or anything provider-specific — it only ever
 * subscribes to MarketPriceUpdatedEvent on the Event Bus, exactly as
 * forward-declared in Phase 5. Everything provider-agnostic (subscription
 * refcounting, heartbeat-staleness watchdog, health reporting) lives here so
 * it applies uniformly whether the active provider is Mock or Dhan.
 */
@Injectable()
export class MarketDataService implements OnModuleInit, OnModuleDestroy {
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
    @Inject(MARKET_DATA_PROVIDER)
    private readonly provider: IMarketDataProvider,
    private readonly subscriptionManager: SubscriptionManager,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(CLOCK) private readonly clock: IClock,
    @Inject(TIMER_SCHEDULER) private readonly scheduler: ITimerScheduler,
    @Inject(MARKET_DATA_RECONNECT_OPTIONS)
    private readonly reconnectOptions: ReconnectOptions,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    this.provider.onTick((tick) => this.handleTick(tick));
    this.provider.onHeartbeat(() => this.handleHeartbeat());
    this.provider.onConnectionStateChange((state) =>
      this.handleConnectionStateChange(state),
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.clearWatchdog();
    if (this.started) {
      await this.provider.disconnect();
    }
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;
    await this.provider.connect();
    this.startHeartbeatWatchdog();
  }

  async stop(): Promise<void> {
    this.clearWatchdog();
    await this.provider.disconnect();
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
      await this.provider.subscribe([instrument]);
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
      await this.provider.unsubscribe([instrumentToken]);
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
      providerType: this.currentProviderType(),
      state: this.connectionState,
      connected: this.provider.isConnected(),
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

  private handleTick(tick: Tick): void {
    this.lastTickReceivedAt = this.clock.now();
    this.lastTickTimestamp = tick.timestamp;
    this.lastTickByInstrument.set(tick.instrumentToken, tick);
    this.eventBus.publish(
      new MarketPriceUpdatedEvent(tick.instrumentToken, tick.lastPrice),
    );
  }

  private handleHeartbeat(): void {
    this.lastHeartbeatAt = this.clock.now();
    this.eventBus.publish(
      new HeartbeatReceivedEvent(this.currentProviderType()),
    );
  }

  private handleConnectionStateChange(state: MarketDataConnectionState): void {
    this.connectionState = state;

    if (state === MarketDataConnectionState.CONNECTED) {
      this.reconnectEventCount = 0;
      this.lastHeartbeatAt = this.clock.now();
      this.eventBus.publish(
        new MarketDataConnectedEvent(this.currentProviderType()),
      );
    } else if (state === MarketDataConnectionState.DISCONNECTED) {
      this.eventBus.publish(
        new MarketDataDisconnectedEvent(this.currentProviderType()),
      );
    } else if (state === MarketDataConnectionState.RECONNECTING) {
      this.reconnectEventCount += 1;
      this.eventBus.publish(
        new MarketDataReconnectingEvent(
          this.currentProviderType(),
          this.reconnectEventCount,
        ),
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
    if (!this.provider.isConnected() || this.lastHeartbeatAt === null) {
      return;
    }
    const age = this.clock.now().getTime() - this.lastHeartbeatAt.getTime();
    if (age > this.reconnectOptions.heartbeatTimeoutMs) {
      this.provider.reconnect().catch(() => undefined);
    }
  }

  private clearWatchdog(): void {
    if (this.watchdogHandle !== null) {
      this.scheduler.clearInterval(this.watchdogHandle);
      this.watchdogHandle = null;
    }
  }

  private currentProviderType(): MarketDataProviderType {
    return this.configService.marketDataProvider === 'DHAN'
      ? MarketDataProviderType.DHAN
      : MarketDataProviderType.MOCK;
  }
}
