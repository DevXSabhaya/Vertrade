export interface BrokerHttpRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  headers: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

export interface BrokerHttpResponse<T = unknown> {
  status: number;
  body: T;
}

/**
 * Isolates DhanBrokerAuth/DhanExecutor from the transport (fetch today).
 * Tests inject a fully mocked implementation of this interface, so no
 * automated test ever makes a real network call. `PUT`/`DELETE` exist
 * because DhanHQ's order-modify/cancel REST endpoints use them (Angel One,
 * the previous broker integration, only ever needed GET/POST).
 */
export interface IBrokerHttpClient {
  request<T = unknown>(req: BrokerHttpRequest): Promise<BrokerHttpResponse<T>>;
}
