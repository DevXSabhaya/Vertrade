import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { TIMER_SCHEDULER } from '@shared/scheduler/timer-scheduler.constants';
import type { ITimerScheduler } from '@shared/scheduler/timer-scheduler.interface';
import { HeartbeatReceivedEvent as MarketDataHeartbeatReceivedEvent } from '@modules/market-data/events/heartbeat-received.event';
import { HEALTH_MONITOR_CONFIG } from '../broker-health.constants';
import type { HealthMonitorConfig } from '../models/health-monitor-config.model';
import { HeartbeatReceivedEvent } from '../events/heartbeat-received.event';
import { HeartbeatTimeoutEvent } from '../events/heartbeat-timeout.event';
import { HeartbeatRecoveredEvent } from '../events/heartbeat-recovered.event';

/**
 * Observes Market Data's own heartbeat (Phase 6's `HeartbeatReceivedEvent`)
 * purely through the Event Bus — no direct dependency on MarketDataService —
 * and layers timeout detection plus its own broker-health-scoped heartbeat
 * events on top. A watchdog (via the shared ITimerScheduler abstraction, so
 * this is fully deterministic in tests with no real timers) periodically
 * checks for staleness.
 */
@Injectable()
export class HeartbeatMonitorService implements OnModuleInit, OnModuleDestroy {
  private lastHeartbeatAt: Date | null = null;
  private timedOut = false;
  private timedOutAt: Date | null = null;
  private watchdogHandle: unknown = null;

  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(CLOCK) private readonly clock: IClock,
    @Inject(TIMER_SCHEDULER) private readonly scheduler: ITimerScheduler,
    @Inject(HEALTH_MONITOR_CONFIG) private readonly config: HealthMonitorConfig,
  ) {}

  onModuleInit(): void {
    // Phase 6's MarketData HeartbeatReceivedEvent doesn't expose a static
    // EVENT_NAME constant, so this string must stay in sync with its
    // `eventName` field ('market-data.heartbeat.received').
    this.eventBus.subscribe<MarketDataHeartbeatReceivedEvent>(
      'market-data.heartbeat.received',
      () => this.recordHeartbeat(),
    );
    this.watchdogHandle = this.scheduler.setInterval(
      () => this.checkTimeout(),
      this.config.healthCheckIntervalMs,
    );
  }

  onModuleDestroy(): void {
    if (this.watchdogHandle !== null) {
      this.scheduler.clearInterval(this.watchdogHandle);
      this.watchdogHandle = null;
    }
  }

  getHeartbeatAgeMs(): number | null {
    if (this.lastHeartbeatAt === null) {
      return null;
    }
    return this.clock.now().getTime() - this.lastHeartbeatAt.getTime();
  }

  isTimedOut(): boolean {
    return this.timedOut;
  }

  private recordHeartbeat(): void {
    const now = this.clock.now();
    const latencyMs = this.lastHeartbeatAt
      ? now.getTime() - this.lastHeartbeatAt.getTime()
      : 0;
    const wasTimedOut = this.timedOut;
    const timedOutAt = this.timedOutAt;

    this.lastHeartbeatAt = now;
    this.timedOut = false;
    this.timedOutAt = null;

    this.eventBus.publish(new HeartbeatReceivedEvent(latencyMs));

    if (wasTimedOut && timedOutAt) {
      this.eventBus.publish(
        new HeartbeatRecoveredEvent(now.getTime() - timedOutAt.getTime()),
      );
    }
  }

  private checkTimeout(): void {
    if (this.lastHeartbeatAt === null || this.timedOut) {
      return;
    }
    const now = this.clock.now();
    const age = now.getTime() - this.lastHeartbeatAt.getTime();
    if (age > this.config.heartbeatTimeoutMs) {
      this.timedOut = true;
      this.timedOutAt = now;
      this.eventBus.publish(new HeartbeatTimeoutEvent(age));
    }
  }
}
