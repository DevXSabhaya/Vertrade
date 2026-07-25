import { BrokerCredentialsProvider } from '@modules/broker/broker-auth/broker-credentials.provider';
import { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import { BrokerSession } from '@modules/broker/broker-auth/entities/broker-session.entity';
import { BrokerToken } from '@modules/broker/broker-auth/value-objects/broker-token.vo';
import { BrokerCredentials } from '@modules/broker/broker-auth/value-objects/broker-credentials.vo';
import type { ReconnectOptions } from '../../models/reconnect-options.model';
import { MarketDataInstrument } from '../../models/market-data-instrument.model';
import { MarketDataConnectionState } from '../../models/market-data-connection-state.enum';
import { FakeTimerScheduler } from '../../testing/fake-timer-scheduler';
import { FakeClock } from '../../testing/fake-clock';
import type {
  IWebSocketClient,
  WebSocketCloseInfo,
} from '../websocket-client.interface';
import { AngelOneMarketDataProvider } from './angel-one-market-data.provider';

const NIFTY = new MarketDataInstrument('NFO', 'NIFTY24500CE', 'TOKEN-1');

class FakeWebSocketClient implements IWebSocketClient {
  open = false;
  sentMessages: string[] = [];
  connectUrls: string[] = [];
  shouldFailConnect = false;

  private messageHandler: ((data: string) => void) | null = null;
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

  onMessage(handler: (data: string) => void): void {
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

  simulateMessage(data: string): void {
    this.messageHandler?.(data);
  }

  simulateUnexpectedClose(): void {
    this.open = false;
    this.closeHandler?.({ code: 1006, reason: 'abnormal closure' });
  }
}

function createFakeSession(): BrokerSession {
  return new BrokerSession(
    'CLIENT1',
    new BrokerToken('jwt-value', 'refresh-value', 'feed-token-value'),
    new Date(),
    new Date(Date.now() + 3_600_000),
  );
}

function createCredentialsProvider(): BrokerCredentialsProvider {
  return {
    getCredentials: () =>
      new BrokerCredentials(
        'api-key',
        'CLIENT1',
        'password',
        'JBSWY3DPEHPK3PXP',
      ),
  } as unknown as BrokerCredentialsProvider;
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

describe('AngelOneMarketDataProvider', () => {
  let wsClient: FakeWebSocketClient;
  let sessionManager: jest.Mocked<
    Pick<BrokerSessionManager, 'ensureSession' | 'refresh'>
  >;
  let scheduler: FakeTimerScheduler;
  let provider: AngelOneMarketDataProvider;

  beforeEach(() => {
    wsClient = new FakeWebSocketClient();
    sessionManager = {
      ensureSession: jest.fn().mockResolvedValue(createFakeSession()),
      refresh: jest.fn().mockResolvedValue(createFakeSession()),
    };
    scheduler = new FakeTimerScheduler();
    provider = new AngelOneMarketDataProvider(
      createCredentialsProvider(),
      sessionManager as unknown as BrokerSessionManager,
      wsClient,
      reconnectOptions(),
      scheduler,
      new FakeClock(),
    );
  });

  it('connects using the session feed token, client code, and API key in the URL', async () => {
    await provider.connect();

    expect(sessionManager.ensureSession).toHaveBeenCalled();
    expect(wsClient.connectUrls).toHaveLength(1);
    const url = new URL(wsClient.connectUrls[0]);
    expect(url.searchParams.get('clientCode')).toBe('CLIENT1');
    expect(url.searchParams.get('feedToken')).toBe('feed-token-value');
    expect(url.searchParams.get('apiKey')).toBe('api-key');
    expect(provider.isConnected()).toBe(true);
  });

  it('starts a heartbeat ping interval once connected', async () => {
    await provider.connect();
    expect(scheduler.pendingIntervalCount()).toBe(1);

    scheduler.fireAllIntervals();
    expect(wsClient.sentMessages).toContain('ping');
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

  it('subscribing while connected sends a subscribe frame with the token list', async () => {
    await provider.connect();
    await provider.subscribe([NIFTY]);

    expect(wsClient.sentMessages).toHaveLength(1);
    const frame = JSON.parse(wsClient.sentMessages[0]) as {
      action: number;
      params: { tokenList: string[] };
    };
    expect(frame.action).toBe(1);
    expect(frame.params.tokenList).toEqual(['TOKEN-1']);
  });

  it('unsubscribing while connected sends an unsubscribe frame', async () => {
    await provider.connect();
    await provider.subscribe([NIFTY]);
    await provider.unsubscribe(['TOKEN-1']);

    const frame = JSON.parse(wsClient.sentMessages[1]) as { action: number };
    expect(frame.action).toBe(0);
  });

  it('receiving "pong" invokes the heartbeat handler', async () => {
    const heartbeats: number[] = [];
    provider.onHeartbeat(() => heartbeats.push(1));
    await provider.connect();

    wsClient.simulateMessage('pong');

    expect(heartbeats).toHaveLength(1);
  });

  it('receiving a well-formed tick frame invokes the tick handler with a normalized Tick', async () => {
    const ticks: { instrumentToken: string; lastPrice: number }[] = [];
    provider.onTick((tick) => ticks.push(tick));
    await provider.connect();
    await provider.subscribe([NIFTY]);

    wsClient.simulateMessage(
      JSON.stringify({ token: 'TOKEN-1', last_traded_price: 123.45 }),
    );

    expect(ticks).toHaveLength(1);
    expect(ticks[0]).toEqual(
      expect.objectContaining({
        instrumentToken: 'TOKEN-1',
        lastPrice: 123.45,
      }),
    );
  });

  it('silently drops a malformed tick frame', async () => {
    const ticks: unknown[] = [];
    provider.onTick((tick) => ticks.push(tick));
    await provider.connect();
    await provider.subscribe([NIFTY]);

    wsClient.simulateMessage('not json{{{');
    wsClient.simulateMessage(JSON.stringify({ garbage: true }));

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
      expect(wsClient.sentMessages.some((m) => m.includes('TOKEN-1'))).toBe(
        true,
      );
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
      const limitedProvider = new AngelOneMarketDataProvider(
        createCredentialsProvider(),
        sessionManager as unknown as BrokerSessionManager,
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
