import { Injectable } from '@nestjs/common';
import { BrokerHealthService } from '@modules/broker-health/broker-health.service';
import type { IScheduledJob } from '../interfaces/scheduled-job.interface';
import { JobName } from '../models/job-name.enum';

@Injectable()
export class HealthCheckJob implements IScheduledJob {
  readonly name = JobName.HEALTH_CHECK;

  constructor(private readonly brokerHealthService: BrokerHealthService) {}

  async run(): Promise<void> {
    await this.brokerHealthService.runHealthCheck();
  }
}
