import type { JobName } from './job-name.enum';

export interface JobResult {
  readonly jobName: JobName;
  readonly succeeded: boolean;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly error: string | null;
  /** True when this invocation didn't actually run — an earlier invocation of the same job was still in flight. Never recorded to metrics/history/events, since nothing happened. */
  readonly skipped?: boolean;
}
