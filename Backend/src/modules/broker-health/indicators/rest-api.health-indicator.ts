import { Inject, Injectable } from '@nestjs/common';
import { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import type { IHealthIndicator } from '../interfaces/health-indicator.interface';
import type { HealthIndicatorResult } from '../models/health-indicator-result.model';
import { HealthStatus } from '../models/health-status.enum';

/**
 * A genuine REST reachability probe would require an authenticated ping call
 * against Dhan's live API — unavailable in this environment (no live
 * credentials, and health checks must never trigger network calls
 * aggressively). This indicator instead uses a documented, honest proxy: a
 * valid, non-expired broker session implies the last REST handshake (login)
 * succeeded. Replace with a real lightweight REST ping once sandbox/live
 * credentials are available.
 *
 * Aggregated across every currently-active broker account session
 * (`BrokerSessionManager.getAllActiveAccountIds()`) — this deployment can
 * have many independent Live sessions at once, one per user's selected
 * broker account. HEALTHY only if every active session is valid, DEGRADED
 * if some are and some aren't, DISCONNECTED if none exist at all.
 */
@Injectable()
export class RestApiHealthIndicator implements IHealthIndicator {
  readonly name = 'restApi';

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
        message: 'No active broker sessions to infer REST reachability from',
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
        message: 'No valid broker sessions to infer REST reachability from',
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
