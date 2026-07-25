import { Injectable } from '@nestjs/common';
import { DailyRiskStateService } from '@modules/risk-management/daily-risk-state.service';
import { CooldownService } from '@modules/risk-management/cooldown.service';
import { CircuitBreakerService } from '@modules/risk-management/circuit-breaker.service';
import type { IScheduledJob } from '../interfaces/scheduled-job.interface';
import { JobName } from '../models/job-name.enum';

/**
 * Phase 11's periodic risk maintenance — daily risk reset, cooldown expiry,
 * and circuit breaker recovery checks, all in one job on one interval
 * (Part 22 of the spec explicitly warns against "duplicate schedulers"; this
 * bundles what would otherwise be three near-identical timers into the
 * existing SchedulerService's established one-job-per-concern pattern).
 * Every method it calls is already idempotent/a no-op when there's nothing
 * to do, so running this on a short interval is always safe.
 */
@Injectable()
export class RiskMaintenanceJob implements IScheduledJob {
  readonly name = JobName.RISK_MAINTENANCE;

  constructor(
    private readonly dailyRiskStateService: DailyRiskStateService,
    private readonly cooldownService: CooldownService,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {}

  async run(): Promise<void> {
    await this.dailyRiskStateService.resetIfNewDay();
    await this.cooldownService.expireIfDue();
    this.circuitBreakerService.checkRecovery();
  }
}
