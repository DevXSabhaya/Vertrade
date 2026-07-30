export interface HttpRequestOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  /**
   * Defaults to `'json'`. DhanInstrumentMasterProvider downloads a CSV file
   * (not JSON) from Dhan's instrument-master URL, so it opts into `'text'`
   * to get the raw response body back verbatim instead of a failed
   * `JSON.parse`.
   */
  responseType?: 'json' | 'text';
}

export interface HttpResponse<T = unknown> {
  status: number;
  body: T;
}

/**
 * Generic, broker-agnostic HTTP transport seam. Any module that needs to call
 * an external HTTP endpoint depends on this, never on a concrete client — so
 * tests can inject a mock and never make a real network call.
 */
export interface IHttpClient {
  request<T = unknown>(
    url: string,
    options?: HttpRequestOptions,
  ): Promise<HttpResponse<T>>;
}
