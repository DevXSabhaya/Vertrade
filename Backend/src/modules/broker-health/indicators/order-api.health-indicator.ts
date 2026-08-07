import { Inject, Injectable } from '@nestjs/common';
import { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import type { IHealthIndicator } from '../interfaces/health-indicator.interface';
import type { HealthIndicatorResult } from '../models/health-indicator-result.model';
import { HealthStatus } from '../models/health-status.enum';

/**
 * The broker order-placement API sits under the same authenticated REST
 * surface as everything else in DhanExecutor — same honest session-validity
 * proxy and same caveat as RestApiHealthIndicator. Kept as a distinct
 * indicator (rather than merged with `restApi`) because the frozen
 * architecture lists "Order API" as its own monitored component.
 *
 * Aggregated across every currently-active broker account session, same
 * rule as `RestApiHealthIndicator`: HEALTHY only if every active session is
 * valid, DEGRADED if some are and some aren't, DISCONNECTED if none exist.
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
    const accountIds = this.sessionManager.getAllActiveAccountIds();
    if (accountIds.length === 0) {
      return {
        name: this.name,
        status: HealthStatus.DISCONNECTED,
        message:
          'No active broker sessions to infer order-API reachability from',
        checkedAt: this.clock.now().toISOString(),
      };
    }

    const validCount = accountIds.filter((accountId) =>
      this.sessionManager.isSessionValid(accountId),
    ).length;

    if (validCount === accountIds.length) {
      return {
        name: this.name,
        status: HealthStatus.HEALTHY,
        checkedAt: this.clock.now().toISOString(),
      };
    }
    if (validCount === 0) {
      return {
        name: this.name,
        status: HealthStatus.DISCONNECTED,
        message:
          'No valid broker sessions to infer order-API reachability from',
        checkedAt: this.clock.now().toISOString(),
      };
    }
    return {
      name: this.name,
      status: HealthStatus.DEGRADED,
      message: `${validCount}/${accountIds.length} broker sessions valid`,
      checkedAt: this.clock.now().toISOString(),
    };
  }
}
