import type { DailyRiskStateService } from '@modules/risk-management/daily-risk-state.service';
import type { CooldownService } from '@modules/risk-management/cooldown.service';
import type { CircuitBreakerService } from '@modules/risk-management/circuit-breaker.service';
import { RiskMaintenanceJob } from './risk-maintenance.job';
import { JobName } from '../models/job-name.enum';

describe('RiskMaintenanceJob', () => {
  it('has the RISK_MAINTENANCE job name', () => {
    const job = new RiskMaintenanceJob(
      { resetIfNewDay: jest.fn() } as unknown as DailyRiskStateService,
      { expireIfDue: jest.fn() } as unknown as CooldownService,
      { checkRecovery: jest.fn() } as unknown as CircuitBreakerService,
    );
    expect(job.name).toBe(JobName.RISK_MAINTENANCE);
  });

  it('runs daily reset, cooldown expiry, and circuit breaker recovery on every tick', async () => {
    const dailyRiskStateService = {
      resetIfNewDay: jest.fn().mockResolvedValue(undefined),
    } as unknown as DailyRiskStateService;
    const cooldownService = {
      expireIfDue: jest.fn().mockResolvedValue(undefined),
    } as unknown as CooldownService;
    const circuitBreakerService = {
      checkRecovery: jest.fn(),
    } as unknown as CircuitBreakerService;

    const job = new RiskMaintenanceJob(
      dailyRiskStateService,
      cooldownService,
      circuitBreakerService,
    );
    await job.run();

    expect(dailyRiskStateService.resetIfNewDay).toHaveBeenCalledTimes(1);
    expect(cooldownService.expireIfDue).toHaveBeenCalledTimes(1);
    expect(circuitBreakerService.checkRecovery).toHaveBeenCalledTimes(1);
  });
});
