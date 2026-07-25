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

    const body = (await response.json()) as T;
    return { status: response.status, body };
  }
}
