import { Inject, Injectable } from '@nestjs/common';
import { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import type { IHealthIndicator } from '../interfaces/health-indicator.interface';
import type { HealthIndicatorResult } from '../models/health-indicator-result.model';
import { HealthStatus } from '../models/health-status.enum';

/**
 * Covers access token / refresh token / session validity in one indicator —
 * `BrokerSessionManager.isSessionValid()` already encapsulates that check
 * locally, with no network call. TOTP validity has no meaningful *ongoing*
 * state to poll (a TOTP secret is either well-formed or not, verified once
 * at login) — it is validated at broker-login time (Phase 2), not
 * re-checked continuously here.
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
    const session = this.sessionManager.getActiveSession();
    if (!session) {
      return this.result(HealthStatus.DISCONNECTED, 'No active broker session');
    }

    if (!this.sessionManager.isSessionValid()) {
      return this.result(
        HealthStatus.DISCONNECTED,
        'Broker session is invalid or expired',
      );
    }

    const msUntilExpiry =
      session.expiresAt.getTime() - this.clock.now().getTime();
    const fiveMinutesMs = 5 * 60 * 1000;
    if (msUntilExpiry <= fiveMinutesMs) {
      return this.result(
        HealthStatus.WARNING,
        'Broker session expires within 5 minutes',
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
