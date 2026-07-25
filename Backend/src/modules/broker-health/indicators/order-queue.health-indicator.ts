import { Inject, Injectable } from '@nestjs/common';
import { OrderQueueService } from '@modules/order-queue/order-queue.service';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import type { IHealthIndicator } from '../interfaces/health-indicator.interface';
import type { HealthIndicatorResult } from '../models/health-indicator-result.model';
import { HealthStatus } from '../models/health-status.enum';

@Injectable()
export class OrderQueueHealthIndicator implements IHealthIndicator {
  readonly name = 'orderQueue';

  constructor(
    private readonly orderQueueService: OrderQueueService,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await -- kept async to match IHealthIndicator; getMetrics() is synchronous
  async check(): Promise<HealthIndicatorResult> {
    const metrics = this.orderQueueService.getMetrics();
    const checkedAt = this.clock.now().toISOString();

    const totalOutcomes = metrics.completed + metrics.failed;
    const failureRate = totalOutcomes > 0 ? metrics.failed / totalOutcomes : 0;

    if (failureRate > 0.5 && totalOutcomes >= 5) {
      return {
        name: this.name,
        status: HealthStatus.DEGRADED,
        message: `High queue failure rate (${Math.round(failureRate * 100)}%)`,
        checkedAt,
      };
    }
    if (metrics.retryCount > 0 && failureRate > 0.2 && totalOutcomes >= 5) {
      return {
        name: this.name,
        status: HealthStatus.WARNING,
        message: 'Elevated queue retry activity',
        checkedAt,
      };
    }

    return { name: this.name, status: HealthStatus.HEALTHY, checkedAt };
  }
}
