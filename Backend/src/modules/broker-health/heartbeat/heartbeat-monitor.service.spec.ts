import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { HeartbeatMonitorService } from './heartbeat-monitor.service';
import { HeartbeatReceivedEvent } from '../events/heartbeat-received.event';
import { HeartbeatTimeoutEvent } from '../events/heartbeat-timeout.event';
import { HeartbeatRecoveredEvent } from '../events/heartbeat-recovered.event';
import { DEFAULT_HEALTH_MONITOR_CONFIG } from '../models/health-monitor-config.model';
import { FakeClock } from '../testing/fake-clock';
import { FakeTimerScheduler } from '../testing/fake-timer-scheduler';

describe('HeartbeatMonitorService', () => {
  let clock: FakeClock;
  let scheduler: FakeTimerScheduler;
  let publishSpy: jest.Mock;
  let eventBus: IEventBus;
  let handlers: Map<string, (event: unknown) => void>;
  let monitor: HeartbeatMonitorService;

  beforeEach(() => {
    clock = new FakeClock();
    scheduler = new FakeTimerScheduler();
    publishSpy = jest.fn();
    handlers = new Map();
    eventBus = {
      publish: publishSpy,
      subscribe: jest.fn((name: string, handler: (event: unknown) => void) =>
        handlers.set(name, handler),
      ),
      subscribeToAll: jest.fn(),
    };
    monitor = new HeartbeatMonitorService(eventBus, clock, scheduler, {
      ...DEFAULT_HEALTH_MONITOR_CONFIG,
      heartbeatTimeoutMs: 5_000,
      healthCheckIntervalMs: 1_000,
    });
    monitor.onModuleInit();
  });

  it('reports null age before any heartbeat has ever been observed', () => {
    expect(monitor.getHeartbeatAgeMs()).toBeNull();
  });

  it('publishes HeartbeatReceivedEvent when Market Data emits its own heartbeat', () => {
    handlers.get('market-data.heartbeat.received')?.({});

    expect(
      publishSpy.mock.calls.some(
        ([e]: [unknown]) => e instanceof HeartbeatReceivedEvent,
      ),
    ).toBe(true);
    // getHeartbeatAgeMs() itself calls clock.now() again, and FakeClock
    // advances by 1ms on every read — so a freshly-recorded heartbeat reads
    // as "just under 1ms old", never exactly 0.
    expect(monitor.getHeartbeatAgeMs()).toBeLessThanOrEqual(1);
  });

  it('publishes HeartbeatTimeoutEvent once the watchdog detects staleness', () => {
    handlers.get('market-data.heartbeat.received')?.({});
    publishSpy.mockClear();

    clock.advanceBy(6_000);
    scheduler.fireAllIntervals();

    expect(monitor.isTimedOut()).toBe(true);
    expect(
      publishSpy.mock.calls.some(
        ([e]: [unknown]) => e instanceof HeartbeatTimeoutEvent,
      ),
    ).toBe(true);
  });

  it('does not re-publish HeartbeatTimeoutEvent on every subsequent watchdog tick', () => {
    handlers.get('market-data.heartbeat.received')?.({});
    clock.advanceBy(6_000);
    scheduler.fireAllIntervals();
    publishSpy.mockClear();

    scheduler.fireAllIntervals();

    expect(
      publishSpy.mock.calls.some(
        ([e]: [unknown]) => e instanceof HeartbeatTimeoutEvent,
      ),
    ).toBe(false);
  });

  it('publishes HeartbeatRecoveredEvent once a heartbeat arrives after a timeout', () => {
    handlers.get('market-data.heartbeat.received')?.({});
    clock.advanceBy(6_000);
    scheduler.fireAllIntervals();
    expect(monitor.isTimedOut()).toBe(true);
    publishSpy.mockClear();

    handlers.get('market-data.heartbeat.received')?.({});

    expect(monitor.isTimedOut()).toBe(false);
    expect(
      publishSpy.mock.calls.some(
        ([e]: [unknown]) => e instanceof HeartbeatRecoveredEvent,
      ),
    ).toBe(true);
  });
});
