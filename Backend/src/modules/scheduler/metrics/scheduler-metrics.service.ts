import { Injectable } from '@nestjs/common';
import { JobName } from '../models/job-name.enum';
import type { SchedulerMetricsSnapshot } from '../models/scheduler-metrics-snapshot.model';

@Injectable()
export class SchedulerMetricsService {
  private executions = 0;
  private failedJobs = 0;
  private totalDurationMs = 0;
  private durationSamples = 0;
  private lastStartupAt: string | null = null;
  private lastMarketCloseAt: string | null = null;

  recordExecution(
    jobName: JobName,
    durationMs: number,
    succeeded: boolean,
    finishedAt: string,
  ): void {
    this.executions += 1;
    this.totalDurationMs += durationMs;
    this.durationSamples += 1;
    if (!succeeded) {
      this.failedJobs += 1;
      return;
    }
    if (jobName === JobName.MORNING_STARTUP) {
      this.lastStartupAt = finishedAt;
    } else if (jobName === JobName.MARKET_CLOSE) {
      this.lastMarketCloseAt = finishedAt;
    }
  }

  snapshot(): SchedulerMetricsSnapshot {
    return {
      executions: this.executions,
      failedJobs: this.failedJobs,
      averageJobDurationMs:
        this.durationSamples > 0
          ? this.totalDurationMs / this.durationSamples
          : null,
      lastStartupAt: this.lastStartupAt,
      lastMarketCloseAt: this.lastMarketCloseAt,
    };
  }
}
