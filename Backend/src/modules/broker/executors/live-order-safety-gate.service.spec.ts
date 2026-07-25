import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventEmitterEventBus } from '@core/event-bus/event-emitter-event-bus';
import { HealthSnapshotUpdatedEvent } from '@modules/broker-health/events/health-snapshot-updated.event';
import { HealthStatus } from '@modules/broker-health/models/health-status.enum';
import type { HealthSnapshot } from '@modules/broker-health/models/health-snapshot.model';
import type { ConfigService } from '@core/config/config.service';
import type { FeatureFlagsService } from '@core/feature-flags/feature-flag.service';
import {
  LiveOrderSafetyGateService,
  LIVE_TRADING_ENABLED_FLAG,
} from './live-order-safety-gate.service';

function healthySnapshot(
  overrides: Partial<HealthSnapshot> = {},
): HealthSnapshot {
  return {
    timestamp: new Date().toISOString(),
    overallStatus: HealthStatus.HEALTHY,
    brokerStatus: HealthStatus.HEALTHY,
    restApiStatus: HealthStatus.HEALTHY,
    websocketStatus: HealthStatus.HEALTHY,
    marketDataStatus: HealthStatus.HEALTHY,
    authStatus: HealthStatus.HEALTHY,
    schedulerStatus: HealthStatus.HEALTHY,
    databaseStatus: HealthStatus.HEALTHY,
    queueStatus: HealthStatus.HEALTHY,
    latency: 10,
    heartbeatAge: 0,
    lastSuccessfulRequest: new Date().toISOString(),
    activeSubscriptions: 0,
    connectedSince: new Date().toISOString(),
    ...overrides,
  };
}

function build(
  options: {
    tradingMode?: 'PAPER' | 'LIVE';
    liveTradingFlagEnabled?: boolean;
  } = {},
) {
  const configService = {
    tradingMode: options.tradingMode ?? 'LIVE',
  } as unknown as ConfigService;
  const featureFlagsService = {
    isEnabled: jest
      .fn()
      .mockResolvedValue(options.liveTradingFlagEnabled ?? true),
  } as unknown as jest.Mocked<FeatureFlagsService>;
  const eventBus = new EventEmitterEventBus(new EventEmitter2());

  const gate = new LiveOrderSafetyGateService(
    configService,
    featureFlagsService,
    eventBus,
  );

  return { gate, eventBus, featureFlagsService };
}

describe('LiveOrderSafetyGateService', () => {
  it('is a permanent no-op for PAPER mode — always allowed, regardless of everything else', async () => {
    const { gate } = build({ tradingMode: 'PAPER' });

    const result = await gate.checkEntryAllowed(false);

    expect(result).toEqual({ allowed: true, reason: null });
  });

  it('blocks a LIVE entry with no explicit confirmation', async () => {
    const { gate, eventBus } = build({ tradingMode: 'LIVE' });
    eventBus.publish(new HealthSnapshotUpdatedEvent(healthySnapshot()));

    const result = await gate.checkEntryAllowed(false);

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/explicit per-order confirmation/i);
  });

  it('blocks a LIVE entry when the LIVE_TRADING_ENABLED feature flag is off, even if confirmed', async () => {
    const { gate, eventBus, featureFlagsService } = build({
      tradingMode: 'LIVE',
      liveTradingFlagEnabled: false,
    });
    eventBus.publish(new HealthSnapshotUpdatedEvent(healthySnapshot()));

    const result = await gate.checkEntryAllowed(true);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain(LIVE_TRADING_ENABLED_FLAG);
    expect(featureFlagsService.isEnabled).toHaveBeenCalledWith(
      LIVE_TRADING_ENABLED_FLAG,
    );
  });

  it('blocks a LIVE entry when no health snapshot has ever been received (fail-safe default)', async () => {
    const { gate } = build({ tradingMode: 'LIVE' });

    const result = await gate.checkEntryAllowed(true);

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/no broker health snapshot/i);
  });

  it('blocks a LIVE entry when overall broker health is not HEALTHY', async () => {
    const { gate, eventBus } = build({ tradingMode: 'LIVE' });
    eventBus.publish(
      new HealthSnapshotUpdatedEvent(
        healthySnapshot({ overallStatus: HealthStatus.DEGRADED }),
      ),
    );

    const result = await gate.checkEntryAllowed(true);

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/broker health is not healthy/i);
  });

  it('blocks a LIVE entry when broker authentication specifically is not HEALTHY, even if overall is healthy', async () => {
    const { gate, eventBus } = build({ tradingMode: 'LIVE' });
    eventBus.publish(
      new HealthSnapshotUpdatedEvent(
        healthySnapshot({ authStatus: HealthStatus.DISCONNECTED }),
      ),
    );

    const result = await gate.checkEntryAllowed(true);

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/broker authentication is not healthy/i);
  });

  it('allows a LIVE entry only when confirmed + flag enabled + broker fully healthy', async () => {
    const { gate, eventBus } = build({ tradingMode: 'LIVE' });
    eventBus.publish(new HealthSnapshotUpdatedEvent(healthySnapshot()));

    const result = await gate.checkEntryAllowed(true);

    expect(result).toEqual({ allowed: true, reason: null });
  });

  it('reflects the latest snapshot, not a stale earlier one', async () => {
    const { gate, eventBus } = build({ tradingMode: 'LIVE' });
    eventBus.publish(new HealthSnapshotUpdatedEvent(healthySnapshot()));
    eventBus.publish(
      new HealthSnapshotUpdatedEvent(
        healthySnapshot({ overallStatus: HealthStatus.DISCONNECTED }),
      ),
    );

    const result = await gate.checkEntryAllowed(true);

    expect(result.allowed).toBe(false);
  });
});
