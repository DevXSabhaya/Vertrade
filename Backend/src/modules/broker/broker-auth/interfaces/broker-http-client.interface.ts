export interface BrokerHttpRequest {
  method: 'GET' | 'POST';
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
 * Isolates AngelOneBrokerAuth from the transport (fetch today). Tests inject a
 * fully mocked implementation of this interface, so no automated test ever
 * makes a real network call.
 */
export interface IBrokerHttpClient {
  request<T = unknown>(req: BrokerHttpRequest): Promise<BrokerHttpResponse<T>>;
}
