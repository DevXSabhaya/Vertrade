import type { BrokerHealthService } from '@modules/broker-health/broker-health.service';
import { HealthCheckJob } from './health-check.job';

describe('HealthCheckJob', () => {
  it('delegates to BrokerHealthService.runHealthCheck()', async () => {
    const brokerHealthService = {
      runHealthCheck: jest.fn().mockResolvedValue({}),
    };
    const job = new HealthCheckJob(
      brokerHealthService as unknown as BrokerHealthService,
    );

    await job.run();

    expect(brokerHealthService.runHealthCheck).toHaveBeenCalled();
  });
});
