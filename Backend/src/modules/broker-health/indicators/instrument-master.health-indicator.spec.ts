import type { InstrumentMasterService } from '@modules/instrument-master/instrument-master.service';
import { InstrumentMasterHealthIndicator } from './instrument-master.health-indicator';
import { HealthStatus } from '../models/health-status.enum';
import { DEFAULT_HEALTH_MONITOR_CONFIG } from '../models/health-monitor-config.model';
import { FakeClock } from '../testing/fake-clock';

function fakeService(
  instrumentCount: number,
  loadedAt: Date,
): InstrumentMasterService {
  return {
    getSnapshot: () => ({ version: 1, loadedAt, instrumentCount }),
  } as unknown as InstrumentMasterService;
}

describe('InstrumentMasterHealthIndicator', () => {
  it('reports DISCONNECTED when the cache is empty', async () => {
    const clock = new FakeClock();
    const indicator = new InstrumentMasterHealthIndicator(
      fakeService(0, new Date(clock.now())),
      DEFAULT_HEALTH_MONITOR_CONFIG,
      clock,
    );
    expect((await indicator.check()).status).toBe(HealthStatus.DISCONNECTED);
  });

  it('reports HEALTHY when freshly loaded', async () => {
    const clock = new FakeClock();
    const loadedAt = clock.now();
    const indicator = new InstrumentMasterHealthIndicator(
      fakeService(100, loadedAt),
      DEFAULT_HEALTH_MONITOR_CONFIG,
      clock,
    );
    expect((await indicator.check()).status).toBe(HealthStatus.HEALTHY);
  });

  it('reports WARNING when the cache is older than the freshness threshold', async () => {
    const clock = new FakeClock();
    const loadedAt = clock.now();
    clock.advanceBy(
      DEFAULT_HEALTH_MONITOR_CONFIG.instrumentFreshnessThresholdMs + 1,
    );
    const indicator = new InstrumentMasterHealthIndicator(
      fakeService(100, loadedAt),
      DEFAULT_HEALTH_MONITOR_CONFIG,
      clock,
    );
    expect((await indicator.check()).status).toBe(HealthStatus.WARNING);
  });
});
