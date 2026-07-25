import { Injectable } from '@nestjs/common';
import type { QueueMetricsSnapshot } from '../models/queue-metrics-snapshot';

/**
 * Pure counters/accumulators — no I/O, no dependencies. OrderQueueService and
 * QueueWorker record events into this as they happen; it never queries
 * anything itself.
 */
@Injectable()
export class QueueMetricsService {
  private completedCount = 0;
  private failedCount = 0;
  private retryCount = 0;
  private totalWaitMs = 0;
  private waitSamples = 0;
  private totalProcessingMs = 0;
  private processingSamples = 0;

  recordWait(ms: number): void {
    this.totalWaitMs += ms;
    this.waitSamples += 1;
  }

  recordProcessingTime(ms: number): void {
    this.totalProcessingMs += ms;
    this.processingSamples += 1;
  }

  recordCompleted(): void {
    this.completedCount += 1;
  }

  recordFailed(): void {
    this.failedCount += 1;
  }

  recordRetry(): void {
    this.retryCount += 1;
  }

  snapshot(queueSize: number, processingCount: number): QueueMetricsSnapshot {
    return {
      queueSize,
      processing: processingCount,
      completed: this.completedCount,
      failed: this.failedCount,
      retryCount: this.retryCount,
      averageWaitMs:
        this.waitSamples > 0 ? this.totalWaitMs / this.waitSamples : null,
      averageProcessingTimeMs:
        this.processingSamples > 0
          ? this.totalProcessingMs / this.processingSamples
          : null,
    };
  }
}
