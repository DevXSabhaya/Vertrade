import { Inject, Injectable } from '@nestjs/common';
import { MarketDataService } from '@modules/market-data/market-data.service';
import { MarketDataConnectionState } from '@modules/market-data/models/market-data-connection-state.enum';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import type { IHealthIndicator } from '../interfaces/health-indicator.interface';
import type { HealthIndicatorResult } from '../models/health-indicator-result.model';
import { HealthStatus } from '../models/health-status.enum';
import { HEALTH_MONITOR_CONFIG } from '../broker-health.constants';
import type { HealthMonitorConfig } from '../models/health-monitor-config.model';

/** Connectivity of the Market Data WebSocket feed — real, not a proxy: MarketDataService tracks actual connection state. */
@Injectable()
export class WebSocketHealthIndicator implements IHealthIndicator {
  readonly name = 'websocket';

  constructor(
    private readonly marketDataService: MarketDataService,
    @Inject(HEALTH_MONITOR_CONFIG) private readonly config: HealthMonitorConfig,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await -- kept async to match IHealthIndicator; getHealth() is synchronous
  async check(): Promise<HealthIndicatorResult> {
    const health = this.marketDataService.getHealth();
    const checkedAt = this.clock.now().toISOString();

    if (health.state === MarketDataConnectionState.DISCONNECTED) {
      return {
        name: this.name,
        status: HealthStatus.DISCONNECTED,
        message: 'Market data feed is disconnected',
        checkedAt,
      };
    }
    if (health.state === MarketDataConnectionState.RECONNECTING) {
      return {
        name: this.name,
        status: HealthStatus.RECOVERING,
        message: 'Market data feed is reconnecting',
        checkedAt,
      };
    }
    if (
      health.heartbeatAgeMs !== null &&
      health.heartbeatAgeMs > this.config.heartbeatTimeoutMs
    ) {
      return {
        name: this.name,
        status: HealthStatus.WARNING,
        message: 'Market data heartbeat is stale',
        checkedAt,
        latencyMs: health.latencyMs ?? undefined,
      };
    }
    if (!health.connected) {
      return { name: this.name, status: HealthStatus.UNKNOWN, checkedAt };
    }

    return {
      name: this.name,
      status: HealthStatus.HEALTHY,
      checkedAt,
      latencyMs: health.latencyMs ?? undefined,
    };
  }
}
