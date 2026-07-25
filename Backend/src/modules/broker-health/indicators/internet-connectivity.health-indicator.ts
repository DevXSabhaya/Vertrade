import { Inject, Injectable } from '@nestjs/common';
import { HTTP_CLIENT } from '@shared/http/http-client.constants';
import type { IHttpClient } from '@shared/http/http-client.interface';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import type { IHealthIndicator } from '../interfaces/health-indicator.interface';
import type { HealthIndicatorResult } from '../models/health-indicator-result.model';
import { HealthStatus } from '../models/health-status.enum';
import { INTERNET_CHECK_URL } from '../broker-health.constants';

/**
 * A real (not proxied) reachability probe against a well-known, highly
 * available public endpoint — through the shared, already-mockable
 * IHttpClient seam, so unit tests never make a real network call. Only ever
 * invoked by BrokerHealthService's periodic check (triggered by the
 * Scheduler), never automatically at module init/boot.
 */
@Injectable()
export class InternetConnectivityHealthIndicator implements IHealthIndicator {
  readonly name = 'internetConnectivity';

  constructor(
    @Inject(HTTP_CLIENT) private readonly httpClient: IHttpClient,
    @Inject(INTERNET_CHECK_URL) private readonly checkUrl: string,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async check(): Promise<HealthIndicatorResult> {
    const startedAt = this.clock.now().getTime();
    try {
      const response = await this.httpClient.request(this.checkUrl, {
        method: 'GET',
        timeoutMs: 5_000,
      });
      const latencyMs = this.clock.now().getTime() - startedAt;
      const checkedAt = this.clock.now().toISOString();

      if (response.status >= 200 && response.status < 500) {
        return {
          name: this.name,
          status: HealthStatus.HEALTHY,
          checkedAt,
          latencyMs,
        };
      }
      return {
        name: this.name,
        status: HealthStatus.DEGRADED,
        message: `Unexpected status ${response.status}`,
        checkedAt,
        latencyMs,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown network error';
      return {
        name: this.name,
        status: HealthStatus.DISCONNECTED,
        message,
        checkedAt: this.clock.now().toISOString(),
      };
    }
  }
}
