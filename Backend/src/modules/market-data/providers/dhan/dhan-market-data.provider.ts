import { Inject, Injectable } from '@nestjs/common';
import { MarketDataCredentialProvider } from '../../market-data-credential.provider';
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
  DHAN_FEED_RESPONSE_CODE_OI,
  DHAN_MARKET_DATA_WS_URL,
  DHAN_MAX_INSTRUMENTS_PER_REQUEST,
  DHAN_REQUEST_CODE_SUBSCRIBE_FULL,
  DHAN_REQUEST_CODE_UNSUBSCRIBE_FULL,
} from './dhan-market-data.constants';
import { parseDhanBinaryTick } from './dhan-tick-binary.parser';
import { normalizeDhanTick } from './dhan-tick.normalizer';

/**
 * Production-shaped DhanHQ v2 Live Market Feed adapter. The actual transport
 * is fully isolated behind IWebSocketClient — this class never touches a
 * real socket directly, so it is unit-testable against a fake client and
 * swappable for a different transport without any change here. Not
 * exercised against the real Dhan feed in this environment (no live
 * credentials); verify against a real/sandbox account before enabling Live
 * market data, same caveat as every other Dhan adapter in this codebase.
 *
 * Dhan's protocol has no application-level ping/pong text frames (unlike
 * Angel One's `"ping"`/`"pong"`) — per its docs, the server pings the
 * transport every 10s and expects the underlying WebSocket implementation
 * to auto-pong within 40s, entirely invisible to application code (Node's
 * native WebSocket, like a browser's, never surfaces ping/pong as
 * 'message' events). There is nothing for this class to send on an
 * interval.
 *
 * Liveness is instead reported two ways: every successfully parsed tick
 * counts as a heartbeat (real evidence the connection is delivering data),
 * AND a scheduler-driven interval fires a heartbeat as long as the socket
 * still reports itself open. The second signal matters because relying on
 * ticks alone is a false-positive-reconnect risk for a low-volume
 * instrument (e.g. a deep-OTM option with no trades for 15+ seconds) —
 * `MarketDataService`'s generic heartbeat-staleness watchdog would
 * otherwise conclude a perfectly healthy connection is stale and force an
 * unnecessary reconnect.
 */
@Injectable()
export class DhanMarketDataProvider implements IMarketDataProvider {
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
    private readonly credentialProvider: MarketDataCredentialProvider,
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

    const credentials = await this.credentialProvider.getCredentials();
    const url = this.buildConnectionUrl(
      credentials.clientId,
      credentials.accessToken,
    );

    this.wsClient.onMessage((data) => this.handleRawMessage(data));
    this.wsClient.onClose(() => this.handleUnexpectedDisconnect());
    this.wsClient.onError(() => this.handleUnexpectedDisconnect());

    await this.wsClient.connect(url);

    this.reconnectAttempts = 0;
    this.setState(MarketDataConnectionState.CONNECTED);
    this.startHeartbeatSignal();
    this.resubscribeAll();
  }

  async disconnect(): Promise<void> {
    this.disconnectRequested = true;
    this.clearReconnectTimer();
    this.clearHeartbeatSignal();
    await this.wsClient.disconnect();
    this.setState(MarketDataConnectionState.DISCONNECTED);
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- interface parity with IMarketDataProvider; nothing here needs to await
  async subscribe(instruments: readonly MarketDataInstrument[]): Promise<void> {
    for (const instrument of instruments) {
      this.instruments.set(instrument.instrumentToken, instrument);
    }
    if (this.wsClient.isOpen()) {
      this.sendSubscribeFrames(instruments);
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- see subscribe()
  async unsubscribe(instrumentTokens: readonly string[]): Promise<void> {
    const toUnsubscribe: MarketDataInstrument[] = [];
    for (const token of instrumentTokens) {
      const instrument = this.instruments.get(token);
      if (instrument) {
        toUnsubscribe.push(instrument);
      }
      this.instruments.delete(token);
    }
    if (this.wsClient.isOpen() && toUnsubscribe.length > 0) {
      this.sendUnsubscribeFrames(toUnsubscribe);
    }
  }

  async reconnect(): Promise<void> {
    this.clearReconnectTimer();
    this.clearHeartbeatSignal();
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
   * See class docstring: Dhan has no application-level ping/pong for this
   * class to hook, so "still open" is the closest honest liveness signal
   * available — fired on the same cadence `MarketDataService` checks
   * staleness at, so it never falls behind that check's own window.
   */
  private startHeartbeatSignal(): void {
    this.heartbeatIntervalHandle = this.scheduler.setInterval(() => {
      if (this.wsClient.isOpen()) {
        this.heartbeatHandler?.();
      }
    }, this.reconnectOptions.heartbeatCheckIntervalMs);
  }

  private clearHeartbeatSignal(): void {
    if (this.heartbeatIntervalHandle !== null) {
      this.scheduler.clearInterval(this.heartbeatIntervalHandle);
      this.heartbeatIntervalHandle = null;
    }
  }

  private resubscribeAll(): void {
    if (this.instruments.size === 0) {
      return;
    }
    this.sendSubscribeFrames(Array.from(this.instruments.values()));
  }

  private sendSubscribeFrames(
    instruments: readonly MarketDataInstrument[],
  ): void {
    this.chunk(instruments).forEach((batch) => {
      this.wsClient.send(
        JSON.stringify({
          RequestCode: DHAN_REQUEST_CODE_SUBSCRIBE_FULL,
          InstrumentCount: batch.length,
          InstrumentList: batch.map((instrument) => ({
            ExchangeSegment: instrument.exchange,
            SecurityId: instrument.instrumentToken,
          })),
        }),
      );
    });
  }

  private sendUnsubscribeFrames(
    instruments: readonly MarketDataInstrument[],
  ): void {
    this.chunk(instruments).forEach((batch) => {
      this.wsClient.send(
        JSON.stringify({
          RequestCode: DHAN_REQUEST_CODE_UNSUBSCRIBE_FULL,
          InstrumentCount: batch.length,
          InstrumentList: batch.map((instrument) => ({
            ExchangeSegment: instrument.exchange,
            SecurityId: instrument.instrumentToken,
          })),
        }),
      );
    });
  }

  /** Dhan allows at most DHAN_MAX_INSTRUMENTS_PER_REQUEST instruments per subscribe/unsubscribe message. */
  private chunk(
    instruments: readonly MarketDataInstrument[],
  ): MarketDataInstrument[][] {
    const batches: MarketDataInstrument[][] = [];
    for (
      let i = 0;
      i < instruments.length;
      i += DHAN_MAX_INSTRUMENTS_PER_REQUEST
    ) {
      batches.push(instruments.slice(i, i + DHAN_MAX_INSTRUMENTS_PER_REQUEST));
    }
    return batches;
  }

  private handleRawMessage(data: string | ArrayBuffer): void {
    if (!(data instanceof ArrayBuffer)) {
      // Dhan's feed is binary-only for tick data; any text frame is not a
      // tick and is ignored rather than guessed at.
      return;
    }

    const parsed = parseDhanBinaryTick(data);
    if (parsed.isFailure) {
      return;
    }

    // Every successfully parsed packet proves the connection is alive and
    // delivering data — see class docstring for why this is one of two
    // signals this class treats as a heartbeat.
    this.heartbeatHandler?.();

    // An OI (code 5) packet carries no real last-traded price — parsed as
    // lastPrice: 0 defensively, but never forwarded as a Tick, which would
    // otherwise look exactly like a genuine trade at price 0 to every
    // downstream consumer (price-crossing logic, P&L). This app always
    // subscribes at Full mode (which already embeds OI directly), so this
    // path exists purely as defensive handling, not the expected flow.
    if (parsed.value.feedResponseCode === DHAN_FEED_RESPONSE_CODE_OI) {
      return;
    }

    const instrument = this.instruments.get(parsed.value.securityId);
    if (!instrument) {
      return;
    }

    this.sequence += 1;
    const result = normalizeDhanTick(
      parsed.value,
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
    this.clearHeartbeatSignal();
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

  private buildConnectionUrl(clientId: string, accessToken: string): string {
    const params = new URLSearchParams({
      version: '2',
      token: accessToken,
      clientId,
      authType: '2',
    });
    return `${DHAN_MARKET_DATA_WS_URL}?${params.toString()}`;
  }
}
