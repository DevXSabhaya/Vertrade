import { Inject, Injectable } from '@nestjs/common';
import { BrokerCredentialsProvider } from '@modules/broker/broker-auth/broker-credentials.provider';
import { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { TIMER_SCHEDULER } from '@shared/scheduler/timer-scheduler.constants';
import type { ITimerScheduler } from '@shared/scheduler/timer-scheduler.interface';
import type { IMarketDataProvider } from '../../interfaces/market-data-provider.interface';
import type { Tick } from '../../models/tick.model';
import type { MarketDataInstrument } from '../../models/market-data-instrument.model';
import { MarketDataConnectionState } from '../../models/market-data-connection-state.enum';
import type { ReconnectOptions } from '../../models/reconnect-options.model';
import { MARKET_DATA_RECONNECT_OPTIONS } from '../../market-data-provider.constants';
import { ReconnectBackoff } from '../../reconnect/reconnect-backoff.util';
import { MARKET_DATA_WEBSOCKET_CLIENT } from '../websocket-client.constants';
import type { IWebSocketClient } from '../websocket-client.interface';
import {
  ANGEL_ONE_HEARTBEAT_PING_MESSAGE,
  ANGEL_ONE_HEARTBEAT_PONG_MESSAGE,
  ANGEL_ONE_MARKET_DATA_WS_URL,
  ANGEL_ONE_SUBSCRIBE_ACTION,
  ANGEL_ONE_UNSUBSCRIBE_ACTION,
} from './angel-one-market-data.constants';
import { normalizeAngelOneTick } from './angel-one-tick.normalizer';

/**
 * Production-shaped Angel One SmartAPI market data adapter. The actual
 * transport is fully isolated behind IWebSocketClient — this class never
 * touches a real socket directly, so it is unit-testable against a fake
 * client and swappable for a different transport without any change here.
 * Not exercised against the real Angel One feed in this environment (no live
 * credentials); verify against a real/sandbox account before enabling Live
 * market data, same caveat as every other Angel One adapter in this codebase.
 */
@Injectable()
export class AngelOneMarketDataProvider implements IMarketDataProvider {
  private state = MarketDataConnectionState.DISCONNECTED;
  private readonly instruments = new Map<string, MarketDataInstrument>();
  private sequence = 0;
  private reconnectAttempts = 0;
  private disconnectRequested = false;
  private reconnectTimerHandle: unknown = null;
  private heartbeatIntervalHandle: unknown = null;

  private tickHandler: ((tick: Tick) => void) | null = null;
  private heartbeatHandler: (() => void) | null = null;
  private connectionStateHandler:
    ((state: MarketDataConnectionState) => void) | null = null;

  constructor(
    private readonly credentialsProvider: BrokerCredentialsProvider,
    private readonly sessionManager: BrokerSessionManager,
    @Inject(MARKET_DATA_WEBSOCKET_CLIENT)
    private readonly wsClient: IWebSocketClient,
    @Inject(MARKET_DATA_RECONNECT_OPTIONS)
    private readonly reconnectOptions: ReconnectOptions,
    @Inject(TIMER_SCHEDULER) private readonly scheduler: ITimerScheduler,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async connect(): Promise<void> {
    this.disconnectRequested = false;
    this.setState(MarketDataConnectionState.CONNECTING);

    const session = await this.sessionManager.ensureSession();
    const credentials = this.credentialsProvider.getCredentials();
    const url = this.buildConnectionUrl(
      credentials.apiKey,
      session.clientCode,
      session.token.getFeedToken(),
    );

    this.wsClient.onMessage((data) => this.handleRawMessage(data));
    this.wsClient.onClose(() => this.handleUnexpectedDisconnect());
    this.wsClient.onError(() => this.handleUnexpectedDisconnect());

    await this.wsClient.connect(url);

    this.reconnectAttempts = 0;
    this.setState(MarketDataConnectionState.CONNECTED);
    this.startHeartbeatPing();
    this.resubscribeAll();
  }

  async disconnect(): Promise<void> {
    this.disconnectRequested = true;
    this.clearReconnectTimer();
    this.clearHeartbeatPing();
    await this.wsClient.disconnect();
    this.setState(MarketDataConnectionState.DISCONNECTED);
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- interface parity with IMarketDataProvider; nothing here needs to await
  async subscribe(instruments: readonly MarketDataInstrument[]): Promise<void> {
    for (const instrument of instruments) {
      this.instruments.set(instrument.instrumentToken, instrument);
    }
    if (this.wsClient.isOpen()) {
      this.sendSubscribeFrame(instruments.map((i) => i.instrumentToken));
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- see subscribe()
  async unsubscribe(instrumentTokens: readonly string[]): Promise<void> {
    for (const token of instrumentTokens) {
      this.instruments.delete(token);
    }
    if (this.wsClient.isOpen()) {
      this.sendUnsubscribeFrame(instrumentTokens);
    }
  }

  async reconnect(): Promise<void> {
    this.clearReconnectTimer();
    this.clearHeartbeatPing();
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

  private resubscribeAll(): void {
    if (this.instruments.size === 0) {
      return;
    }
    this.sendSubscribeFrame(Array.from(this.instruments.keys()));
  }

  private sendSubscribeFrame(tokens: readonly string[]): void {
    this.wsClient.send(
      JSON.stringify({
        action: ANGEL_ONE_SUBSCRIBE_ACTION,
        params: { tokenList: tokens },
      }),
    );
  }

  private sendUnsubscribeFrame(tokens: readonly string[]): void {
    this.wsClient.send(
      JSON.stringify({
        action: ANGEL_ONE_UNSUBSCRIBE_ACTION,
        params: { tokenList: tokens },
      }),
    );
  }

  private startHeartbeatPing(): void {
    this.heartbeatIntervalHandle = this.scheduler.setInterval(() => {
      if (this.wsClient.isOpen()) {
        this.wsClient.send(ANGEL_ONE_HEARTBEAT_PING_MESSAGE);
      }
    }, this.reconnectOptions.heartbeatCheckIntervalMs);
  }

  private clearHeartbeatPing(): void {
    if (this.heartbeatIntervalHandle !== null) {
      this.scheduler.clearInterval(this.heartbeatIntervalHandle);
      this.heartbeatIntervalHandle = null;
    }
  }

  private handleRawMessage(data: string): void {
    if (data === ANGEL_ONE_HEARTBEAT_PONG_MESSAGE) {
      this.heartbeatHandler?.();
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }

    const token = (parsed as { token?: unknown }).token;
    if (typeof token !== 'string') {
      return;
    }
    const instrument = this.instruments.get(token);
    if (!instrument) {
      return;
    }

    this.sequence += 1;
    const result = normalizeAngelOneTick(
      parsed,
      instrument,
      this.clock.now(),
      this.sequence,
    );
    if (result.isSuccess) {
      this.tickHandler?.(result.value);
    }
  }

  /** Only auto-reconnects a connection that was genuinely CONNECTED and then
   * dropped — an error/close during the initial connect() attempt is left
   * for that call's own caller to handle. */
  private handleUnexpectedDisconnect(): void {
    if (this.disconnectRequested) {
      return;
    }
    if (this.state !== MarketDataConnectionState.CONNECTED) {
      return;
    }
    this.clearHeartbeatPing();
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts += 1;
    if (
      ReconnectBackoff.hasExceededMaxRetries(
        this.reconnectAttempts,
        this.reconnectOptions,
      )
    ) {
      this.setState(MarketDataConnectionState.DISCONNECTED);
      return;
    }

    this.setState(MarketDataConnectionState.RECONNECTING);
    const delay = ReconnectBackoff.computeDelayMs(
      this.reconnectAttempts,
      this.reconnectOptions,
    );
    this.reconnectTimerHandle = this.scheduler.setTimeout(() => {
      this.connect().catch(() => this.scheduleReconnect());
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimerHandle !== null) {
      this.scheduler.clearTimeout(this.reconnectTimerHandle);
      this.reconnectTimerHandle = null;
    }
  }

  private setState(state: MarketDataConnectionState): void {
    this.state = state;
    this.connectionStateHandler?.(state);
  }

  private buildConnectionUrl(
    apiKey: string,
    clientCode: string,
    feedToken: string,
  ): string {
    const params = new URLSearchParams({ clientCode, feedToken, apiKey });
    return `${ANGEL_ONE_MARKET_DATA_WS_URL}?${params.toString()}`;
  }
}
