export interface WebSocketCloseInfo {
  readonly code?: number;
  readonly reason?: string;
}

/**
 * A thin, generic WebSocket transport abstraction — any WS-based market data
 * provider (DhanMarketDataProvider today) depends on this rather than a
 * concrete socket library, so the real transport can be swapped or mocked
 * without touching provider business logic. `data` is `ArrayBuffer` for
 * binary frames (DhanHQ's live market feed is a binary protocol) and
 * `string` for text frames.
 */
export interface IWebSocketClient {
  connect(url: string): Promise<void>;
  disconnect(): Promise<void>;
  send(data: string): void;
  isOpen(): boolean;
  onMessage(handler: (data: string | ArrayBuffer) => void): void;
  onOpen(handler: () => void): void;
  onClose(handler: (info: WebSocketCloseInfo) => void): void;
  onError(handler: (error: Error) => void): void;
}
