import { NativeWebSocketClient } from './native-websocket-client';
import { MarketDataProviderException } from '../exceptions/market-data-provider.exception';

type Listener = (event: unknown) => void;

/** A fully in-memory stand-in for the global WebSocket — no real network. */
class FakeGlobalWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = FakeGlobalWebSocket.CONNECTING;
  private readonly listeners = new Map<string, Listener[]>();

  constructor(public readonly url: string) {}

  addEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  send(): void {
    // no-op: this is a fake, no real socket to write to
  }

  close(): void {
    this.readyState = FakeGlobalWebSocket.CLOSED;
    this.emit('close', { code: 1000, reason: 'normal' });
  }

  emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  simulateOpen(): void {
    this.readyState = FakeGlobalWebSocket.OPEN;
    this.emit('open', {});
  }
}

describe('NativeWebSocketClient', () => {
  let OriginalWebSocket: typeof WebSocket;
  let fakeSocket: FakeGlobalWebSocket | undefined;

  beforeEach(() => {
    OriginalWebSocket = global.WebSocket;
    const FakeCtor = function (this: unknown, url: string) {
      fakeSocket = new FakeGlobalWebSocket(url);
      return fakeSocket;
    } as unknown as typeof WebSocket;
    (FakeCtor as unknown as { OPEN: number }).OPEN = FakeGlobalWebSocket.OPEN;
    global.WebSocket = FakeCtor;
  });

  afterEach(() => {
    global.WebSocket = OriginalWebSocket;
    fakeSocket = undefined;
  });

  it('resolves connect() once the socket opens', async () => {
    const client = new NativeWebSocketClient();
    const connectPromise = client.connect('wss://example.invalid/stream');

    fakeSocket?.simulateOpen();
    await connectPromise;

    expect(client.isOpen()).toBe(true);
  });

  it('delivers text messages to the registered handler', async () => {
    const client = new NativeWebSocketClient();
    const received: (string | ArrayBuffer)[] = [];
    client.onMessage((data) => received.push(data));

    const connectPromise = client.connect('wss://example.invalid/stream');
    fakeSocket?.simulateOpen();
    await connectPromise;

    fakeSocket?.emit('message', { data: 'hello' });

    expect(received).toEqual(['hello']);
  });

  it('passes binary frames through as ArrayBuffer, unmodified — DhanHQ ticks are binary', async () => {
    const client = new NativeWebSocketClient();
    const received: (string | ArrayBuffer)[] = [];
    client.onMessage((data) => received.push(data));

    const connectPromise = client.connect('wss://example.invalid/stream');
    fakeSocket?.simulateOpen();
    await connectPromise;

    const buffer = new Uint8Array([1, 2, 3, 4]).buffer;
    fakeSocket?.emit('message', { data: buffer });

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(buffer);
  });

  it('notifies onClose with the close code and reason', async () => {
    const client = new NativeWebSocketClient();
    const closes: { code?: number; reason?: string }[] = [];
    client.onClose((info) => closes.push(info));

    const connectPromise = client.connect('wss://example.invalid/stream');
    fakeSocket?.simulateOpen();
    await connectPromise;

    await client.disconnect();

    expect(closes).toEqual([{ code: 1000, reason: 'normal' }]);
  });

  it('rejects connect() and notifies onError when the socket errors', async () => {
    const client = new NativeWebSocketClient();
    const errors: Error[] = [];
    client.onError((error) => errors.push(error));

    const connectPromise = client.connect('wss://example.invalid/stream');
    fakeSocket?.emit('error', {});

    await expect(connectPromise).rejects.toThrow(MarketDataProviderException);
    expect(errors).toHaveLength(1);
  });

  it('throws when sending while not open', () => {
    const client = new NativeWebSocketClient();
    expect(() => client.send('ping')).toThrow(MarketDataProviderException);
  });

  it('isOpen() is false before connecting', () => {
    const client = new NativeWebSocketClient();
    expect(client.isOpen()).toBe(false);
  });
});
