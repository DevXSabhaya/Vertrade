export interface WebSocketCloseInfo {
  readonly code?: number;
  readonly reason?: string;
}

/**
 * A thin, generic WebSocket transport abstraction — any future WS-based
 * market data provider (Angel One today, others later) depends on this
 * rather than a concrete socket library, so the real transport can be
 * swapped or mocked without touching provider business logic.
 */
export interface IWebSocketClient {
  connect(url: string): Promise<void>;
  disconnect(): Promise<void>;
  send(data: string): void;
  isOpen(): boolean;
  onMessage(handler: (data: string) => void): void;
  onOpen(handler: () => void): void;
  onClose(handler: (info: WebSocketCloseInfo) => void): void;
  onError(handler: (error: Error) => void): void;
}
