import { Injectable } from '@nestjs/common';
import type {
  BrokerHttpRequest,
  BrokerHttpResponse,
  IBrokerHttpClient,
} from './interfaces/broker-http-client.interface';

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * The only place in the codebase that makes a real network call for broker
 * authentication. Everything else depends on IBrokerHttpClient, so tests
 * never need to touch this class or the network at all.
 */
@Injectable()
export class FetchBrokerHttpClient implements IBrokerHttpClient {
  async request<T = unknown>(
    req: BrokerHttpRequest,
  ): Promise<BrokerHttpResponse<T>> {
    const response = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body ? JSON.stringify(req.body) : undefined,
      signal: AbortSignal.timeout(req.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    // A DELETE with no response body (e.g. a 204, or an empty 200) must not
    // throw trying to JSON-parse an empty string — DhanHQ's cancel-order
    // endpoint can return either a JSON body or an empty one depending on
    // outcome.
    const text = await response.text();
    const body = (text === '' ? {} : (JSON.parse(text) as unknown)) as T;
    return { status: response.status, body };
  }
}
