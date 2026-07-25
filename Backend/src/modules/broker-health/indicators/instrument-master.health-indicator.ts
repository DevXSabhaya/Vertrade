import { Inject, Injectable } from '@nestjs/common';
import { InstrumentMasterService } from '@modules/instrument-master/instrument-master.service';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import type { IHealthIndicator } from '../interfaces/health-indicator.interface';
import type { HealthIndicatorResult } from '../models/health-indicator-result.model';
import { HealthStatus } from '../models/health-status.enum';
import { HEALTH_MONITOR_CONFIG } from '../broker-health.constants';
import type { HealthMonitorConfig } from '../models/health-monitor-config.model';

@Injectable()
export class InstrumentMasterHealthIndicator implements IHealthIndicator {
  readonly name = 'instrumentMaster';

  constructor(
    private readonly instrumentMasterService: InstrumentMasterService,
    @Inject(HEALTH_MONITOR_CONFIG) private readonly config: HealthMonitorConfig,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await -- kept async to match IHealthIndicator; getSnapshot() is synchronous
  async check(): Promise<HealthIndicatorResult> {
    const snapshot = this.instrumentMasterService.getSnapshot();
    const now = this.clock.now();
    const checkedAt = now.toISOString();

    if (snapshot.instrumentCount === 0) {
      return {
        name: this.name,
        status: HealthStatus.DISCONNECTED,
        message: 'Instrument master cache is empty',
        checkedAt,
      };
    }

    const ageMs = now.getTime() - snapshot.loadedAt.getTime();
    if (ageMs > this.config.instrumentFreshnessThresholdMs) {
      return {
        name: this.name,
        status: HealthStatus.WARNING,
        message: `Instrument master cache is stale (loaded ${Math.round(ageMs / 60_000)} minutes ago)`,
        checkedAt,
      };
    }

    return { name: this.name, status: HealthStatus.HEALTHY, checkedAt };
  }
}
