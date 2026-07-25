import type { IHttpClient } from '@shared/http/http-client.interface';
import { InternetConnectivityHealthIndicator } from './internet-connectivity.health-indicator';
import { HealthStatus } from '../models/health-status.enum';
import { FakeClock } from '../testing/fake-clock';

describe('InternetConnectivityHealthIndicator', () => {
  it('reports HEALTHY on a successful response, never touching a real network', async () => {
    const httpClient: jest.Mocked<IHttpClient> = {
      request: jest.fn().mockResolvedValue({ status: 200, body: null }),
    };
    const indicator = new InternetConnectivityHealthIndicator(
      httpClient,
      'https://example.invalid',
      new FakeClock(),
    );

    const result = await indicator.check();

    expect(result.status).toBe(HealthStatus.HEALTHY);
    expect(httpClient.request).toHaveBeenCalledWith(
      'https://example.invalid',
      expect.any(Object),
    );
  });

  it('reports DEGRADED on an unexpected status code', async () => {
    const httpClient: jest.Mocked<IHttpClient> = {
      request: jest.fn().mockResolvedValue({ status: 500, body: null }),
    };
    const indicator = new InternetConnectivityHealthIndicator(
      httpClient,
      'https://example.invalid',
      new FakeClock(),
    );
    expect((await indicator.check()).status).toBe(HealthStatus.DEGRADED);
  });

  it('reports DISCONNECTED when the request throws', async () => {
    const httpClient: jest.Mocked<IHttpClient> = {
      request: jest.fn().mockRejectedValue(new Error('network unreachable')),
    };
    const indicator = new InternetConnectivityHealthIndicator(
      httpClient,
      'https://example.invalid',
      new FakeClock(),
    );
    expect((await indicator.check()).status).toBe(HealthStatus.DISCONNECTED);
  });
});
