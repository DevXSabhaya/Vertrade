import { MarketDataCredentialProvider } from '../../market-data-credential.provider';
import type { ReconnectOptions } from '../../models/reconnect-options.model';
import { MarketDataInstrument } from '../../models/market-data-instrument.model';
import { MarketDataConnectionState } from '../../models/market-data-connection-state.enum';
import { FakeTimerScheduler } from '../../testing/fake-timer-scheduler';
import { FakeClock } from '../../testing/fake-clock';
import type {
  IWebSocketClient,
  WebSocketCloseInfo,
} from '../websocket-client.interface';
import { DhanMarketDataProvider } from './dhan-market-data.provider';
import {
  DHAN_FEED_RESPONSE_CODE_FULL,
  DHAN_FEED_RESPONSE_CODE_OI,
} from './dhan-market-data.constants';

const NIFTY = new MarketDataInstrument('NSE_FNO', 'NIFTY24500CE', '49081');

function buildFullPacket(securityId: number, lastPrice: number): ArrayBuffer {
  const buffer = new ArrayBuffer(8 + 54);
  const view = new DataView(buffer);
  view.setUint8(0, DHAN_FEED_RESPONSE_CODE_FULL);
  view.setInt16(1, buffer.byteLength, true);
  view.setUint8(3, 2);
  view.setInt32(4, securityId, true);
  view.setFloat32(8, lastPrice, true);
  return buffer;
}

function buildOiPacket(securityId: number, oi: number): ArrayBuffer {
  const buffer = new ArrayBuffer(12);
  const view = new DataView(buffer);
  view.setUint8(0, DHAN_FEED_RESPONSE_CODE_OI);
  view.setInt16(1, buffer.byteLength, true);
  view.setUint8(3, 2);
  view.setInt32(4, securityId, true);
  view.setInt32(8, oi, true);
  return buffer;
}

class FakeWebSocketClient implements IWebSocketClient {
  open = false;
  sentMessages: string[] = [];
  connectUrls: string[] = [];
  shouldFailConnect = false;

  private messageHandler: ((data: string | ArrayBuffer) => void) | null = null;
  private openHandler: (() => void) | null = null;
  private closeHandler: ((info: WebSocketCloseInfo) => void) | null = null;
  private errorHandler: ((error: Error) => void) | null = null;

  connect(url: string): Promise<void> {
    this.connectUrls.push(url);
    if (this.shouldFailConnect) {
      this.shouldFailConnect = false;
      const error = new Error('connect failed');
      this.errorHandler?.(error);
      return Promise.reject(error);
    }
    this.open = true;
    this.openHandler?.();
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    this.open = false;
    return Promise.resolve();
  }

  send(data: string): void {
    if (!this.open) {
      throw new Error('WebSocket is not open');
    }
    this.sentMessages.push(data);
  }

  isOpen(): boolean {
    return this.open;
  }

  onMessage(handler: (data: string | ArrayBuffer) => void): void {
    this.messageHandler = handler;
  }

  onOpen(handler: () => void): void {
    this.openHandler = handler;
  }

  onClose(handler: (info: WebSocketCloseInfo) => void): void {
    this.closeHandler = handler;
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }

  simulateMessage(data: string | ArrayBuffer): void {
    this.messageHandler?.(data);
  }

  simulateUnexpectedClose(): void {
    this.open = false;
    this.closeHandler?.({ code: 1006, reason: 'abnormal closure' });
  }
}

function createCredentialProvider(): MarketDataCredentialProvider {
  return {
    hasCredentials: () => true,
    getCredentials: () =>
      Promise.resolve({
        clientId: 'CLIENT1',
        accessToken: 'access-token-value',
      }),
  } as unknown as MarketDataCredentialProvider;
}

function reconnectOptions(
  overrides: Partial<ReconnectOptions> = {},
): ReconnectOptions {
  return {
    baseDelayMs: 100,
    maxDelayMs: 1_000,
    maxRetries: 3,
    jitterRatio: 0,
    heartbeatTimeoutMs: 5_000,
    heartbeatCheckIntervalMs: 1_000,
    ...overrides,
  };
}

describe('DhanMarketDataProvider', () => {
  let wsClient: FakeWebSocketClient;
  let scheduler: FakeTimerScheduler;
  let provider: DhanMarketDataProvider;

  beforeEach(() => {
    wsClient = new FakeWebSocketClient();
    scheduler = new FakeTimerScheduler();
    provider = new DhanMarketDataProvider(
      createCredentialProvider(),
      wsClient,
      reconnectOptions(),
      scheduler,
      new FakeClock(),
    );
  });

  it('connects using the credential provider access token, client id, and version/authType query params', async () => {
    await provider.connect();

    expect(wsClient.connectUrls).toHaveLength(1);
    const url = new URL(wsClient.connectUrls[0]);
    expect(url.searchParams.get('clientId')).toBe('CLIENT1');
    expect(url.searchParams.get('token')).toBe('access-token-value');
    expect(url.searchParams.get('version')).toBe('2');
    expect(url.searchParams.get('authType')).toBe('2');
    expect(provider.isConnected()).toBe(true);
  });

  it('notifies connection state changes through CONNECTING -> CONNECTED', async () => {
    const states: MarketDataConnectionState[] = [];
    provider.onConnectionStateChange((state) => states.push(state));

    await provider.connect();

    expect(states).toEqual([
      MarketDataConnectionState.CONNECTING,
      MarketDataConnectionState.CONNECTED,
    ]);
  });

  it('subscribing before connect just tracks the instrument, sending nothing', async () => {
    await provider.subscribe([NIFTY]);
    expect(wsClient.sentMessages).toHaveLength(0);
  });

  it('subscribing while connected sends a Full-packet subscribe frame with the security id list', async () => {
    await provider.connect();
    await provider.subscribe([NIFTY]);

    expect(wsClient.sentMessages).toHaveLength(1);
    const frame = JSON.parse(wsClient.sentMessages[0]) as {
      RequestCode: number;
      InstrumentList: { ExchangeSegment: string; SecurityId: string }[];
    };
    expect(frame.RequestCode).toBe(21);
    expect(frame.InstrumentList).toEqual([
      { ExchangeSegment: 'NSE_FNO', SecurityId: '49081' },
    ]);
  });

  it('unsubscribing while connected sends an unsubscribe frame', async () => {
    await provider.connect();
    await provider.subscribe([NIFTY]);
    await provider.unsubscribe(['49081']);

    const frame = JSON.parse(wsClient.sentMessages[1]) as {
      RequestCode: number;
    };
    expect(frame.RequestCode).toBe(22);
  });

  it('receiving any well-formed binary tick frame invokes the heartbeat handler', async () => {
    const heartbeats: number[] = [];
    provider.onHeartbeat(() => heartbeats.push(1));
    await provider.connect();
    await provider.subscribe([NIFTY]);

    wsClient.simulateMessage(buildFullPacket(49081, 123.45));

    expect(heartbeats).toHaveLength(1);
  });

  it('fires a periodic heartbeat as long as the socket stays open, even with zero ticks — Dhan has no app-level ping/pong to rely on instead', async () => {
    const heartbeats: number[] = [];
    provider.onHeartbeat(() => heartbeats.push(1));
    await provider.connect();

    scheduler.fireAllIntervals();

    expect(heartbeats.length).toBeGreaterThan(0);
  });

  it('stops the periodic heartbeat once disconnected', async () => {
    await provider.connect();
    await provider.disconnect();

    expect(scheduler.pendingIntervalCount()).toBe(0);
  });

  it('an OI-only packet (code 5) counts as a heartbeat but never produces a Tick — it has no real last-traded price', async () => {
    const heartbeats: number[] = [];
    const ticks: unknown[] = [];
    provider.onHeartbeat(() => heartbeats.push(1));
    provider.onTick((tick) => ticks.push(tick));
    await provider.connect();
    await provider.subscribe([NIFTY]);

    wsClient.simulateMessage(buildOiPacket(49081, 55000));

    expect(heartbeats).toHaveLength(1);
    expect(ticks).toHaveLength(0);
  });

  it('receiving a well-formed Full-packet tick invokes the tick handler with a normalized Tick', async () => {
    const ticks: { instrumentToken: string; lastPrice: number }[] = [];
    provider.onTick((tick) => ticks.push(tick));
    await provider.connect();
    await provider.subscribe([NIFTY]);

    wsClient.simulateMessage(buildFullPacket(49081, 123.45));

    expect(ticks).toHaveLength(1);
    expect(ticks[0]).toEqual(
      expect.objectContaining({
        instrumentToken: '49081',
        lastPrice: expect.closeTo(123.45, 2),
      }),
    );
  });

  it('silently drops a malformed or non-binary frame', async () => {
    const ticks: unknown[] = [];
    provider.onTick((tick) => ticks.push(tick));
    await provider.connect();
    await provider.subscribe([NIFTY]);

    wsClient.simulateMessage('not binary');
    wsClient.simulateMessage(new ArrayBuffer(2));

    expect(ticks).toHaveLength(0);
  });

  it('drops a tick for a security id that was never subscribed', async () => {
    const ticks: unknown[] = [];
    provider.onTick((tick) => ticks.push(tick));
    await provider.connect();
    await provider.subscribe([NIFTY]);

    wsClient.simulateMessage(buildFullPacket(999999, 1));

    expect(ticks).toHaveLength(0);
  });

  describe('reconnection', () => {
    it('automatically reconnects and resubscribes after an unexpected close', async () => {
      await provider.connect();
      await provider.subscribe([NIFTY]);
      wsClient.sentMessages = [];

      wsClient.simulateUnexpectedClose();
      expect(scheduler.pendingTimeoutCount()).toBe(1);

      scheduler.fireAllTimeouts();
      await Promise.resolve();
      await Promise.resolve();

      expect(wsClient.connectUrls).toHaveLength(2);
      expect(provider.isConnected()).toBe(true);
      expect(wsClient.sentMessages.some((m) => m.includes('49081'))).toBe(true);
    });

    it('does not reconnect on a close that happens during the initial connect attempt', async () => {
      wsClient.shouldFailConnect = true;
      await expect(provider.connect()).rejects.toThrow();

      expect(scheduler.pendingTimeoutCount()).toBe(0);
    });

    it('does not reconnect after an intentional disconnect()', async () => {
      await provider.connect();
      await provider.disconnect();

      wsClient.simulateUnexpectedClose();

      expect(scheduler.pendingTimeoutCount()).toBe(0);
    });

    it('gives up after exceeding maxRetries and settles as DISCONNECTED', async () => {
      const limitedProvider = new DhanMarketDataProvider(
        createCredentialProvider(),
        wsClient,
        reconnectOptions({ maxRetries: 1 }),
        scheduler,
        new FakeClock(),
      );
      await limitedProvider.connect();

      wsClient.simulateUnexpectedClose();
      wsClient.shouldFailConnect = true;
      scheduler.fireAllTimeouts();
      await Promise.resolve();
      await Promise.resolve();

      expect(limitedProvider.isConnected()).toBe(false);
    });
  });
});
