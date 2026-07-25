import { Inject, Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, ConnectionStates } from 'mongoose';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import type { IHealthIndicator } from '../interfaces/health-indicator.interface';
import type { HealthIndicatorResult } from '../models/health-indicator-result.model';
import { HealthStatus } from '../models/health-status.enum';

/** Same technique as HealthController (Phase 0): readyState, no live query. */
@Injectable()
export class DatabaseConnectivityHealthIndicator implements IHealthIndicator {
  readonly name = 'database';

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await -- kept async to match IHealthIndicator; readyState is a synchronous property
  async check(): Promise<HealthIndicatorResult> {
    const checkedAt = this.clock.now().toISOString();
    const connected = this.connection.readyState === ConnectionStates.connected;
    return {
      name: this.name,
      status: connected ? HealthStatus.HEALTHY : HealthStatus.DISCONNECTED,
      message: connected
        ? undefined
        : 'MongoDB connection is not in the connected state',
      checkedAt,
    };
  }
}
