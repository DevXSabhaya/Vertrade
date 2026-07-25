import type { JobName } from './job-name.enum';

export interface JobResult {
  readonly jobName: JobName;
  readonly succeeded: boolean;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly error: string | null;
}
