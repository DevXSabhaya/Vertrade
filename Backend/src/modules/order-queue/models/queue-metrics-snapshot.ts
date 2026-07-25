export interface QueueMetricsSnapshot {
  readonly queueSize: number;
  readonly processing: number;
  readonly completed: number;
  readonly failed: number;
  readonly retryCount: number;
  readonly averageWaitMs: number | null;
  readonly averageProcessingTimeMs: number | null;
}
