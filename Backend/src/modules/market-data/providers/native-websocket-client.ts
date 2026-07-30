import { Injectable } from '@nestjs/common';
import { MarketDataProviderException } from '../exceptions/market-data-provider.exception';
import type {
  IWebSocketClient,
  WebSocketCloseInfo,
} from './websocket-client.interface';

/**
 * A real, generic WebSocket client built on Node's native global WebSocket
 * (stable since Node 22) — this would work against any real WS endpoint.
 * It is not exercised against DhanHQ's real feed in this environment (no
 * live credentials); DhanMarketDataProvider is unit-tested against a fake
 * IWebSocketClient instead. Same "real but unverified against the live
 * broker" posture as FetchBrokerHttpClient. `binaryType` is forced to
 * `arraybuffer` because DhanHQ's live market feed is a binary protocol —
 * without this, Node's native WebSocket delivers binary frames as a `Blob`,
 * which can't be synchronously parsed.
 */
@Injectable()
export class NativeWebSocketClient implements IWebSocketClient {
  private socket: WebSocket | null = null;
  private messageHandler: ((data: string | ArrayBuffer) => void) | null = null;
  private openHandler: (() => void) | null = null;
  private closeHandler: ((info: WebSocketCloseInfo) => void) | null = null;
  private errorHandler: ((error: Error) => void) | null = null;

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.binaryType = 'arraybuffer';
      this.socket = socket;

      socket.addEventListener('open', () => {
        this.openHandler?.();
        resolve();
      });
      socket.addEventListener('message', (event: MessageEvent) => {
        const data: string | ArrayBuffer =
          typeof event.data === 'string' || event.data instanceof ArrayBuffer
            ? event.data
            : String(event.data);
        this.messageHandler?.(data);
      });
      socket.addEventListener('close', (event: CloseEvent) => {
        this.closeHandler?.({ code: event.code, reason: event.reason });
      });
      socket.addEventListener('error', () => {
        const error = new MarketDataProviderException(
          `WebSocket connection error for ${url}`,
        );
        this.errorHandler?.(error);
        reject(error);
      });
    });
  }

  disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve();
        return;
      }
      this.socket.addEventListener('close', () => resolve(), { once: true });
      this.socket.close();
    });
  }

  send(data: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new MarketDataProviderException(
        'Cannot send: WebSocket connection is not open',
      );
    }
    this.socket.send(data);
  }

  isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
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
}
