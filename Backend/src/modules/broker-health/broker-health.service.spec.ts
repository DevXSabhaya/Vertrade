import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { FeatureFlagsService } from '@core/feature-flags/feature-flag.service';
import type { MarketDataService } from '@modules/market-data/market-data.service';
import { MarketDataProviderType } from '@modules/market-data/models/market-data-provider-type.enum';
import { BrokerHealthService } from './broker-health.service';
import type {
  HealthAggregatorService,
  AggregatedHealth,
} from './aggregator/health-aggregator.service';
import type { RecoveryManagerService } from './recovery/recovery-manager.service';
import type { HeartbeatMonitorService } from './heartbeat/heartbeat-monitor.service';
import { BrokerHealthMetricsService } from './metrics/broker-health-metrics.service';
import { HealthStatus } from './models/health-status.enum';
import { DEFAULT_HEALTH_MONITOR_CONFIG } from './models/health-monitor-config.model';
import type { IHealthSnapshotRepository } from './interfaces/health-snapshot-repository.interface';
import { FakeClock } from './testing/fake-clock';
import {
  BrokerHealthyEvent,
  BrokerDisconnectedEvent,
  BrokerRecoveredEvent,
  HealthSnapshotUpdatedEvent,
} from './events';

function aggregatedResult(overall: HealthStatus): AggregatedHealth {
  const results = [{ name: 'x', status: overall, checkedAt: 'x' }];
  return {
    overall,
    results,
    byName: new Map(results.map((r) => [r.name, r])),
    checkedAt: 'x',
  };
}

describe('BrokerHealthService', () => {
  let clock: FakeClock;
  let aggregator: jest.Mocked<Pick<HealthAggregatorService, 'runAll'>>;
  let recoveryManager: jest.Mocked<Pick<RecoveryManagerService, 'recover'>>;
  let heartbeatMonitor: jest.Mocked<
    Pick<HeartbeatMonitorService, 'getHeartbeatAgeMs'>
  >;
  let marketDataService: jest.Mocked<Pick<MarketDataService, 'getHealth'>>;
  let featureFlagsService: jest.Mocked<Pick<FeatureFlagsService, 'isEnabled'>>;
  let metrics: BrokerHealthMetricsService;
  let publishSpy: jest.Mock;
  let eventBus: IEventBus;
  let repository: jest.Mocked<IHealthSnapshotRepository>;
  let service: BrokerHealthService;

  const config = {
    ...DEFAULT_HEALTH_MONITOR_CONFIG,
    retryCount: 2,
    reconnectBaseDelayMs: 100,
    reconnectMaxDelayMs: 1_000,
  };

  function buildService(): BrokerHealthService {
    return new BrokerHealthService(
      aggregator as unknown as HealthAggregatorService,
      recoveryManager as unknown as RecoveryManagerService,
      heartbeatMonitor as unknown as HeartbeatMonitorService,
      marketDataService as unknown as MarketDataService,
      featureFlagsService as unknown as FeatureFlagsService,
      metrics,
      eventBus,
      clock,
      config,
      repository,
    );
  }

  beforeEach(() => {
    clock = new FakeClock();
    aggregator = {
      runAll: jest
        .fn()
        .mockResolvedValue(aggregatedResult(HealthStatus.HEALTHY)),
    };
    recoveryManager = { recover: jest.fn().mockResolvedValue(undefined) };
    heartbeatMonitor = { getHeartbeatAgeMs: jest.fn().mockReturnValue(1_000) };
    marketDataService = {
      getHealth: jest.fn().mockReturnValue({
        providerType: MarketDataProviderType.MOCK,
        state: 'CONNECTED',
        connected: true,
        latencyMs: 10,
        heartbeatAgeMs: 1_000,
        subscriptionsCount: 3,
      }),
    };
    featureFlagsService = { isEnabled: jest.fn().mockResolvedValue(true) };
    metrics = new BrokerHealthMetricsService();
    publishSpy = jest.fn();
    eventBus = {
      publish: publishSpy,
      subscribe: jest.fn(),
      subscribeToAll: jest.fn(),
    };
    repository = {
      save: jest.fn().mockResolvedValue(undefined),
      findLatest: jest.fn(),
    };
    service = buildService();
  });

  describe('health aggregation / snapshot', () => {
    it('builds a full HealthSnapshot from the aggregated indicator results', async () => {
      const snapshot = await service.runHealthCheck();

      expect(snapshot.overallStatus).toBe(HealthStatus.HEALTHY);
      expect(snapshot.activeSubscriptions).toBe(3);
      expect(snapshot.heartbeatAge).toBe(1_000);
      expect(
        publishSpy.mock.calls.some(
          ([e]: [unknown]) => e instanceof HealthSnapshotUpdatedEvent,
        ),
      ).toBe(true);
    });

    it('persists every snapshot', async () => {
      await service.runHealthCheck();
      expect(repository.save).toHaveBeenCalled();
    });

    it('getSnapshot() returns UNKNOWN defaults before any check has run', () => {
      expect(service.getSnapshot().overallStatus).toBe(HealthStatus.UNKNOWN);
    });

    it('getSnapshot() returns the most recent snapshot after a check', async () => {
      await service.runHealthCheck();
      expect(service.getSnapshot().overallStatus).toBe(HealthStatus.HEALTHY);
    });
  });

  describe('maintenance mode', () => {
    it('forces overallStatus to MAINTENANCE regardless of indicator results', async () => {
      service.setMaintenanceMode(true);
      const snapshot = await service.runHealthCheck();
      expect(snapshot.overallStatus).toBe(HealthStatus.MAINTENANCE);
    });

    it('skips automatic recovery while in maintenance mode', async () => {
      aggregator.runAll.mockResolvedValue(
        aggregatedResult(HealthStatus.DISCONNECTED),
      );
      service.setMaintenanceMode(true);

      await service.runHealthCheck();

      expect(recoveryManager.recover).not.toHaveBeenCalled();
    });
  });

  describe('state transitions / events', () => {
    it('publishes BrokerHealthyEvent on the first healthy check', async () => {
      await service.runHealthCheck();
      expect(
        publishSpy.mock.calls.some(
          ([e]: [unknown]) => e instanceof BrokerHealthyEvent,
        ),
      ).toBe(true);
    });

    it('publishes BrokerDisconnectedEvent on transition into DISCONNECTED', async () => {
      await service.runHealthCheck(); // HEALTHY first
      aggregator.runAll.mockResolvedValue(
        aggregatedResult(HealthStatus.DISCONNECTED),
      );

      await service.runHealthCheck();

      expect(
        publishSpy.mock.calls.some(
          ([e]: [unknown]) => e instanceof BrokerDisconnectedEvent,
        ),
      ).toBe(true);
    });

    it('publishes BrokerRecoveredEvent when transitioning back to HEALTHY from DISCONNECTED', async () => {
      aggregator.runAll.mockResolvedValueOnce(
        aggregatedResult(HealthStatus.DISCONNECTED),
      );
      await service.runHealthCheck();
      aggregator.runAll.mockResolvedValue(
        aggregatedResult(HealthStatus.HEALTHY),
      );
      publishSpy.mockClear();

      await service.runHealthCheck();

      expect(
        publishSpy.mock.calls.some(
          ([e]: [unknown]) => e instanceof BrokerRecoveredEvent,
        ),
      ).toBe(true);
    });

    it('does not re-publish a transition event when the status does not change', async () => {
      await service.runHealthCheck();
      publishSpy.mockClear();

      await service.runHealthCheck();

      expect(
        publishSpy.mock.calls.some(
          ([e]: [unknown]) => e instanceof BrokerHealthyEvent,
        ),
      ).toBe(false);
    });
  });

  describe('automatic recovery / feature flags', () => {
    it('attempts recovery when disconnected and AUTOMATIC_RECOVERY is enabled', async () => {
      aggregator.runAll.mockResolvedValue(
        aggregatedResult(HealthStatus.DISCONNECTED),
      );

      await service.runHealthCheck();

      expect(recoveryManager.recover).toHaveBeenCalled();
    });

    it('never attempts recovery when AUTOMATIC_RECOVERY is disabled', async () => {
      featureFlagsService.isEnabled.mockResolvedValue(false);
      aggregator.runAll.mockResolvedValue(
        aggregatedResult(HealthStatus.DISCONNECTED),
      );

      await service.runHealthCheck();

      expect(recoveryManager.recover).not.toHaveBeenCalled();
    });

    it('never attempts recovery while healthy', async () => {
      await service.runHealthCheck();
      expect(recoveryManager.recover).not.toHaveBeenCalled();
    });
  });

  describe('recovery backoff', () => {
    it('does not retry recovery again within the backoff window', async () => {
      aggregator.runAll.mockResolvedValue(
        aggregatedResult(HealthStatus.DISCONNECTED),
      );

      await service.runHealthCheck(); // attempt 1 (elapsed = Infinity, always allowed)
      await service.runHealthCheck(); // attempt 2: within backoff window (100ms base), should be skipped

      expect(recoveryManager.recover).toHaveBeenCalledTimes(1);
    });

    it('gives up after exceeding the configured retry count', async () => {
      aggregator.runAll.mockResolvedValue(
        aggregatedResult(HealthStatus.DISCONNECTED),
      );

      for (let i = 0; i < 10; i += 1) {
        clock.advanceBy(10_000); // clear any backoff window between attempts
        await service.runHealthCheck();
      }

      expect(recoveryManager.recover).toHaveBeenCalledTimes(config.retryCount);
    });

    it('resets the reconnect attempt counter once healthy again', async () => {
      aggregator.runAll.mockResolvedValue(
        aggregatedResult(HealthStatus.DISCONNECTED),
      );
      clock.advanceBy(10_000);
      await service.runHealthCheck();
      expect(recoveryManager.recover).toHaveBeenCalledTimes(1);

      aggregator.runAll.mockResolvedValue(
        aggregatedResult(HealthStatus.HEALTHY),
      );
      await service.runHealthCheck();

      aggregator.runAll.mockResolvedValue(
        aggregatedResult(HealthStatus.DISCONNECTED),
      );
      clock.advanceBy(10_000);
      await service.runHealthCheck();

      expect(recoveryManager.recover).toHaveBeenCalledTimes(2);
    });
  });

  describe('metrics', () => {
    it('exposes a metrics snapshot', async () => {
      await service.runHealthCheck();
      const snapshot = service.getMetrics();
      expect(snapshot.averageResponseTimeMs).not.toBeNull();
    });

    it('records a failed health check when overall status is not healthy/maintenance', async () => {
      aggregator.runAll.mockResolvedValue(
        aggregatedResult(HealthStatus.WARNING),
      );
      await service.runHealthCheck();
      expect(service.getMetrics().failedHealthChecks).toBe(1);
    });
  });
});
