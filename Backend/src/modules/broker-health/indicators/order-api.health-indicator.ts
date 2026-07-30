import { Inject, Injectable } from '@nestjs/common';
import { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import type { IHealthIndicator } from '../interfaces/health-indicator.interface';
import type { HealthIndicatorResult } from '../models/health-indicator-result.model';
import { HealthStatus } from '../models/health-status.enum';

/**
 * The broker order-placement API sits under the same authenticated REST
 * surface as everything else in DhanExecutor (Phase 4) — same honest
 * session-validity proxy and same caveat as RestApiHealthIndicator. Kept as
 * a distinct indicator (rather than merged with `restApi`) because the
 * frozen architecture lists "Order API" as its own monitored component, and
 * a future phase measuring real order-submission success/failure rates can
 * upgrade this indicator without touching anything else.
 */
@Injectable()
export class OrderApiHealthIndicator implements IHealthIndicator {
  readonly name = 'orderApi';

  constructor(
    private readonly sessionManager: BrokerSessionManager,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await -- kept async to match IHealthIndicator; the underlying check is synchronous/local
  async check(): Promise<HealthIndicatorResult> {
    const session = this.sessionManager.getActiveSession();
    if (!session || !this.sessionManager.isSessionValid()) {
      return {
        name: this.name,
        status: HealthStatus.DISCONNECTED,
        message: 'No valid broker session to infer order-API reachability from',
        checkedAt: this.clock.now().toISOString(),
      };
    }
    return {
      name: this.name,
      status: HealthStatus.HEALTHY,
      checkedAt: this.clock.now().toISOString(),
    };
  }
}
