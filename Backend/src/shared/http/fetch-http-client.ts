import { Injectable } from '@nestjs/common';
import type {
  HttpRequestOptions,
  HttpResponse,
  IHttpClient,
} from './http-client.interface';

const DEFAULT_TIMEOUT_MS = 15_000;

@Injectable()
export class FetchHttpClient implements IHttpClient {
  async request<T = unknown>(
    url: string,
    options: HttpRequestOptions = {},
  ): Promise<HttpResponse<T>> {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: options.headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    const body = (
      options.responseType === 'text'
        ? await response.text()
        : await response.json()
    ) as T;
    return { status: response.status, body };
  }
}
