import { Inject, Injectable } from '@nestjs/common';
import { MarketDataService } from '@modules/market-data/market-data.service';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import type { IHealthIndicator } from '../interfaces/health-indicator.interface';
import type { HealthIndicatorResult } from '../models/health-indicator-result.model';
import { HealthStatus } from '../models/health-status.enum';

/**
 * Distinct from `websocket` (raw connectivity): this indicator reports on
 * the provider's *operational* health — is it connected AND actually
 * carrying subscriptions with acceptable tick latency. A connected socket
 * with zero subscriptions or high latency is a meaningfully different
 * problem than the socket being down outright.
 */
@Injectable()
export class MarketDataProviderHealthIndicator implements IHealthIndicator {
  readonly name = 'marketDataProvider';

  constructor(
    private readonly marketDataService: MarketDataService,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await -- kept async to match IHealthIndicator; getHealth() is synchronous
  async check(): Promise<HealthIndicatorResult> {
    const health = this.marketDataService.getHealth();
    const checkedAt = this.clock.now().toISOString();

    if (!health.connected) {
      return {
        name: this.name,
        status: HealthStatus.DISCONNECTED,
        message: `${health.providerType} provider is not connected`,
        checkedAt,
      };
    }
    if (health.latencyMs !== null && health.latencyMs > 5_000) {
      return {
        name: this.name,
        status: HealthStatus.DEGRADED,
        message: 'Tick latency exceeds 5s',
        checkedAt,
        latencyMs: health.latencyMs,
      };
    }

    return {
      name: this.name,
      status: HealthStatus.HEALTHY,
      checkedAt,
      latencyMs: health.latencyMs ?? undefined,
    };
  }
}
