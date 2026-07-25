import { Inject, Injectable } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { FeatureFlagsService } from '@core/feature-flags/feature-flag.service';
import { MarketDataService } from '@modules/market-data/market-data.service';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { HealthAggregatorService } from './aggregator/health-aggregator.service';
import { RecoveryManagerService } from './recovery/recovery-manager.service';
import { HeartbeatMonitorService } from './heartbeat/heartbeat-monitor.service';
import { BrokerHealthMetricsService } from './metrics/broker-health-metrics.service';
import { HealthStatus } from './models/health-status.enum';
import type { HealthSnapshot } from './models/health-snapshot.model';
import type { HealthMonitorConfig } from './models/health-monitor-config.model';
import {
  HEALTH_MONITOR_CONFIG,
  HEALTH_SNAPSHOT_REPOSITORY,
} from './broker-health.constants';
import type { IHealthSnapshotRepository } from './interfaces/health-snapshot-repository.interface';
import { HealthAggregationPolicy } from './policies/health-aggregation.policy';
import { ReconnectBackoffPolicy } from './policies/reconnect-backoff.policy';
import {
  BrokerHealthyEvent,
  BrokerWarningEvent,
  BrokerDisconnectedEvent,
  BrokerRecoveredEvent,
  HealthSnapshotUpdatedEvent,
} from './events';

const AUTOMATIC_RECOVERY_FLAG = 'AUTOMATIC_RECOVERY';
const RECOVERABLE_STATUSES: ReadonlySet<HealthStatus> = new Set([
  HealthStatus.DISCONNECTED,
  HealthStatus.DEGRADED,
]);

/**
 * The single source of truth for broker health. Never calls the Trading
 * Engine, never notifies consumers directly — every observable outcome is a
 * published event or a value returned from `getSnapshot()`/`getMetrics()`.
 * Health checks are only ever run on demand (`runHealthCheck()`), triggered
 * by SchedulerModule's HealthCheckJob — this service never starts its own
 * polling loop, exactly mirroring Phase 6's MarketDataService not
 * auto-connecting at boot.
 */
@Injectable()
export class BrokerHealthService {
  private currentSnapshot: HealthSnapshot | null = null;
  private previousOverallStatus: HealthStatus = HealthStatus.UNKNOWN;
  private connectedSince: Date | null = null;
  private lastSuccessfulRequestAt: Date | null = null;
  private maintenanceMode = false;
  private reconnectAttempts = 0;
  private lastRecoveryAttemptAt: Date | null = null;

  constructor(
    private readonly aggregator: HealthAggregatorService,
    private readonly recoveryManager: RecoveryManagerService,
    private readonly heartbeatMonitor: HeartbeatMonitorService,
    private readonly marketDataService: MarketDataService,
    private readonly featureFlagsService: FeatureFlagsService,
    private readonly metrics: BrokerHealthMetricsService,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(CLOCK) private readonly clock: IClock,
    @Inject(HEALTH_MONITOR_CONFIG) private readonly config: HealthMonitorConfig,
    @Inject(HEALTH_SNAPSHOT_REPOSITORY)
    private readonly repository: IHealthSnapshotRepository,
  ) {
    this.maintenanceMode = config.maintenanceMode;
  }

  setMaintenanceMode(enabled: boolean): void {
    this.maintenanceMode = enabled;
  }

  isMaintenanceMode(): boolean {
    return this.maintenanceMode;
  }

  async runHealthCheck(): Promise<HealthSnapshot> {
    const startedAt = this.clock.now().getTime();
    const aggregated = await this.aggregator.runAll();
    this.metrics.recordResponseTime(this.clock.now().getTime() - startedAt);

    const overall = this.maintenanceMode
      ? HealthStatus.MAINTENANCE
      : aggregated.overall;
    if (
      overall !== HealthStatus.HEALTHY &&
      overall !== HealthStatus.MAINTENANCE
    ) {
      this.metrics.recordFailedHealthCheck();
    } else {
      this.lastSuccessfulRequestAt = this.clock.now();
    }

    const snapshot = this.buildSnapshot(aggregated.byName, overall);
    this.currentSnapshot = snapshot;
    await this.repository.save(snapshot);
    this.eventBus.publish(new HealthSnapshotUpdatedEvent(snapshot));

    this.handleTransition(this.previousOverallStatus, overall);
    this.previousOverallStatus = overall;

    if (RECOVERABLE_STATUSES.has(overall)) {
      await this.maybeAttemptRecovery(overall);
    } else {
      this.reconnectAttempts = 0;
    }

    return snapshot;
  }

  getSnapshot(): HealthSnapshot {
    return (
      this.currentSnapshot ?? {
        timestamp: this.clock.now().toISOString(),
        overallStatus: HealthStatus.UNKNOWN,
        brokerStatus: HealthStatus.UNKNOWN,
        restApiStatus: HealthStatus.UNKNOWN,
        websocketStatus: HealthStatus.UNKNOWN,
        marketDataStatus: HealthStatus.UNKNOWN,
        authStatus: HealthStatus.UNKNOWN,
        schedulerStatus: HealthStatus.UNKNOWN,
        databaseStatus: HealthStatus.UNKNOWN,
        queueStatus: HealthStatus.UNKNOWN,
        latency: null,
        heartbeatAge: null,
        lastSuccessfulRequest: null,
        activeSubscriptions: 0,
        connectedSince: null,
      }
    );
  }

  getMetrics() {
    return this.metrics.snapshot(this.clock.now());
  }

  private buildSnapshot(
    byName: ReadonlyMap<string, { status: HealthStatus; latencyMs?: number }>,
    overall: HealthStatus,
  ): HealthSnapshot {
    const statusOf = (name: string): HealthStatus =>
      byName.get(name)?.status ?? HealthStatus.UNKNOWN;
    const brokerStatus = HealthAggregationPolicy.aggregateStatuses(
      ['brokerAuth', 'restApi', 'orderApi'].map(statusOf),
    );

    return {
      timestamp: this.clock.now().toISOString(),
      overallStatus: overall,
      brokerStatus,
      restApiStatus: statusOf('restApi'),
      websocketStatus: statusOf('websocket'),
      marketDataStatus: statusOf('marketDataProvider'),
      authStatus: statusOf('brokerAuth'),
      schedulerStatus: statusOf('scheduler'),
      databaseStatus: statusOf('database'),
      queueStatus: statusOf('orderQueue'),
      latency: byName.get('internetConnectivity')?.latencyMs ?? null,
      heartbeatAge: this.heartbeatMonitor.getHeartbeatAgeMs(),
      lastSuccessfulRequest: this.lastSuccessfulRequestAt
        ? this.lastSuccessfulRequestAt.toISOString()
        : null,
      activeSubscriptions:
        this.marketDataService.getHealth().subscriptionsCount,
      connectedSince: this.connectedSince
        ? this.connectedSince.toISOString()
        : null,
    };
  }

  private handleTransition(
    previous: HealthStatus,
    current: HealthStatus,
  ): void {
    if (previous === current) {
      return;
    }

    if (current === HealthStatus.HEALTHY) {
      this.connectedSince = this.clock.now();
      this.metrics.recordConnected(this.connectedSince);
      this.eventBus.publish(new BrokerHealthyEvent(previous));
      if (
        previous === HealthStatus.DISCONNECTED ||
        previous === HealthStatus.DEGRADED
      ) {
        this.eventBus.publish(new BrokerRecoveredEvent(this.reconnectAttempts));
      }
    } else if (current === HealthStatus.WARNING) {
      this.eventBus.publish(
        new BrokerWarningEvent(
          `Health degraded from ${previous} to ${current}`,
        ),
      );
    } else if (current === HealthStatus.DISCONNECTED) {
      this.connectedSince = null;
      this.metrics.recordDisconnected();
      this.eventBus.publish(
        new BrokerDisconnectedEvent(
          `Health degraded from ${previous} to ${current}`,
        ),
      );
    }
  }

  private async maybeAttemptRecovery(overall: HealthStatus): Promise<void> {
    if (this.maintenanceMode) {
      return;
    }
    const automaticRecoveryEnabled = await this.featureFlagsService.isEnabled(
      AUTOMATIC_RECOVERY_FLAG,
    );
    if (!automaticRecoveryEnabled) {
      return;
    }

    const backoffOptions = {
      baseDelayMs: this.config.reconnectBaseDelayMs,
      maxDelayMs: this.config.reconnectMaxDelayMs,
      jitterRatio: this.config.reconnectJitterRatio,
      retryCount: this.config.retryCount,
    };
    const nextAttempt = this.reconnectAttempts + 1;
    if (
      ReconnectBackoffPolicy.hasExceededRetryCount(nextAttempt, backoffOptions)
    ) {
      return;
    }

    const requiredDelayMs = ReconnectBackoffPolicy.computeDelayMs(
      nextAttempt,
      backoffOptions,
    );
    const elapsedSinceLastAttemptMs = this.lastRecoveryAttemptAt
      ? this.clock.now().getTime() - this.lastRecoveryAttemptAt.getTime()
      : Number.POSITIVE_INFINITY;
    if (elapsedSinceLastAttemptMs < requiredDelayMs) {
      return; // still within the backoff window: do not reconnect aggressively
    }

    this.reconnectAttempts = nextAttempt;
    this.lastRecoveryAttemptAt = this.clock.now();
    this.metrics.recordReconnect();
    try {
      await this.recoveryManager.recover(`Health status is ${overall}`);
    } catch {
      // Recorded in recovery history by RecoveryManagerService; the next
      // health check cycle will decide whether to retry (subject to the
      // same backoff), so nothing further to do here.
    }
  }
}
