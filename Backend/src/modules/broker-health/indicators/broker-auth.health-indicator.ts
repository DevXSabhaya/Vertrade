import { Inject, Injectable } from '@nestjs/common';
import { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import type { IHealthIndicator } from '../interfaces/health-indicator.interface';
import type { HealthIndicatorResult } from '../models/health-indicator-result.model';
import { HealthStatus } from '../models/health-status.enum';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

/**
 * Covers access token / refresh token / session validity in one indicator —
 * `BrokerSessionManager.isSessionValid(accountId)` already encapsulates
 * that check locally, with no network call, per account.
 *
 * Aggregated across every currently-active broker account session:
 * DISCONNECTED if none exist or any is invalid/expired, WARNING if all are
 * valid but at least one expires within 5 minutes, HEALTHY otherwise. A
 * single unhealthy account is treated as the worst case for this
 * deployment-wide indicator — per-account detail is available via
 * `BrokerAccountService.getRuntimeStatus()`.
 */
@Injectable()
export class BrokerAuthHealthIndicator implements IHealthIndicator {
  readonly name = 'brokerAuth';

  constructor(
    private readonly sessionManager: BrokerSessionManager,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await -- kept async to match IHealthIndicator; the underlying checks are synchronous/local
  async check(): Promise<HealthIndicatorResult> {
    const accountIds = this.sessionManager.getAllActiveAccountIds();
    if (accountIds.length === 0) {
      return this.result(
        HealthStatus.DISCONNECTED,
        'No active broker sessions',
      );
    }

    let earliestExpiryMs = Number.POSITIVE_INFINITY;
    for (const accountId of accountIds) {
      if (!this.sessionManager.isSessionValid(accountId)) {
        return this.result(
          HealthStatus.DISCONNECTED,
          `Broker session for account ${accountId} is invalid or expired`,
        );
      }
      const session = this.sessionManager.getActiveSession(accountId);
      if (session) {
        earliestExpiryMs = Math.min(
          earliestExpiryMs,
          session.expiresAt.getTime(),
        );
      }
    }

    const msUntilExpiry = earliestExpiryMs - this.clock.now().getTime();
    if (msUntilExpiry <= FIVE_MINUTES_MS) {
      return this.result(
        HealthStatus.WARNING,
        'At least one broker session expires within 5 minutes',
      );
    }

    return this.result(HealthStatus.HEALTHY);
  }

  private result(
    status: HealthStatus,
    message?: string,
  ): HealthIndicatorResult {
    return {
      name: this.name,
      status,
      message,
      checkedAt: this.clock.now().toISOString(),
    };
  }
}
