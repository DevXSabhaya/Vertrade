export interface SchedulerMetricsSnapshot {
  readonly executions: number;
  readonly failedJobs: number;
  readonly averageJobDurationMs: number | null;
  readonly lastStartupAt: string | null;
  readonly lastMarketCloseAt: string | null;
}
