import type { IHealthIndicator } from '../interfaces/health-indicator.interface';
import { HealthStatus } from '../models/health-status.enum';
import { HealthAggregatorService } from './health-aggregator.service';
import { FakeClock } from '../testing/fake-clock';

function fakeIndicator(name: string, status: HealthStatus): IHealthIndicator {
  return {
    name,
    check: jest
      .fn()
      .mockResolvedValue({ name, status, checkedAt: new Date().toISOString() }),
  };
}

describe('HealthAggregatorService', () => {
  it('runs every indicator and aggregates the overall status', async () => {
    const indicators = [
      fakeIndicator('a', HealthStatus.HEALTHY),
      fakeIndicator('b', HealthStatus.WARNING),
    ];
    const aggregator = new HealthAggregatorService(indicators, new FakeClock());

    const result = await aggregator.runAll();

    expect(result.overall).toBe(HealthStatus.WARNING);
    expect(result.results).toHaveLength(2);
    expect(result.byName.get('a')?.status).toBe(HealthStatus.HEALTHY);
    expect(result.byName.get('b')?.status).toBe(HealthStatus.WARNING);
  });

  it('calls every indicator even if others fail severely', async () => {
    const a = fakeIndicator('a', HealthStatus.DISCONNECTED);
    const b = fakeIndicator('b', HealthStatus.HEALTHY);
    const aggregator = new HealthAggregatorService([a, b], new FakeClock());

    await aggregator.runAll();

    expect(a.check).toHaveBeenCalled();
    expect(b.check).toHaveBeenCalled();
  });

  it('returns UNKNOWN overall when there are no indicators', async () => {
    const aggregator = new HealthAggregatorService([], new FakeClock());
    const result = await aggregator.runAll();
    expect(result.overall).toBe(HealthStatus.UNKNOWN);
  });
});
