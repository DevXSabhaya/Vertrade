import { Injectable } from '@nestjs/common';
import type { BrokerHealthMetricsSnapshot } from '../models/broker-health-metrics-snapshot.model';

/** Pure counters/accumulators — no I/O, no dependencies (Phase 7's QueueMetricsService pattern). */
@Injectable()
export class BrokerHealthMetricsService {
  private reconnectCount = 0;
  private recoveryAttempts = 0;
  private failedHealthChecks = 0;
  private totalHeartbeatLatencyMs = 0;
  private heartbeatLatencySamples = 0;
  private totalResponseTimeMs = 0;
  private responseTimeSamples = 0;
  private connectedSince: Date | null = null;

  recordReconnect(): void {
    this.reconnectCount += 1;
  }

  recordRecoveryAttempt(): void {
    this.recoveryAttempts += 1;
  }

  recordFailedHealthCheck(): void {
    this.failedHealthChecks += 1;
  }

  recordHeartbeatLatency(ms: number): void {
    this.totalHeartbeatLatencyMs += ms;
    this.heartbeatLatencySamples += 1;
  }

  recordResponseTime(ms: number): void {
    this.totalResponseTimeMs += ms;
    this.responseTimeSamples += 1;
  }

  recordConnected(at: Date): void {
    this.connectedSince = at;
  }

  recordDisconnected(): void {
    this.connectedSince = null;
  }

  snapshot(now: Date): BrokerHealthMetricsSnapshot {
    return {
      uptimeMs: this.connectedSince
        ? now.getTime() - this.connectedSince.getTime()
        : null,
      reconnectCount: this.reconnectCount,
      averageHeartbeatLatencyMs:
        this.heartbeatLatencySamples > 0
          ? this.totalHeartbeatLatencyMs / this.heartbeatLatencySamples
          : null,
      recoveryAttempts: this.recoveryAttempts,
      failedHealthChecks: this.failedHealthChecks,
      averageResponseTimeMs:
        this.responseTimeSamples > 0
          ? this.totalResponseTimeMs / this.responseTimeSamples
          : null,
    };
  }
}
