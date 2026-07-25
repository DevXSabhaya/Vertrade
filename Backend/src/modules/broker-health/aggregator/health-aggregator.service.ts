import { Inject, Injectable } from '@nestjs/common';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import type { IHealthIndicator } from '../interfaces/health-indicator.interface';
import type { HealthIndicatorResult } from '../models/health-indicator-result.model';
import { HEALTH_INDICATORS } from '../broker-health.constants';
import { HealthAggregationPolicy } from '../policies/health-aggregation.policy';

export interface AggregatedHealth {
  readonly overall: ReturnType<typeof HealthAggregationPolicy.aggregate>;
  readonly results: readonly HealthIndicatorResult[];
  readonly byName: ReadonlyMap<string, HealthIndicatorResult>;
  readonly checkedAt: string;
}

/**
 * Runs every registered indicator (in parallel — indicators are fully
 * independent of each other) and folds the results into one overall status
 * via HealthAggregationPolicy. Knows nothing about brokers, WebSockets, or
 * Mongo — only the IHealthIndicator interface.
 */
@Injectable()
export class HealthAggregatorService {
  constructor(
    @Inject(HEALTH_INDICATORS) private readonly indicators: IHealthIndicator[],
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async runAll(): Promise<AggregatedHealth> {
    const results = await Promise.all(
      this.indicators.map((indicator) => indicator.check()),
    );
    const byName = new Map(results.map((result) => [result.name, result]));

    return {
      overall: HealthAggregationPolicy.aggregate(results),
      results,
      byName,
      checkedAt: this.clock.now().toISOString(),
    };
  }
}
