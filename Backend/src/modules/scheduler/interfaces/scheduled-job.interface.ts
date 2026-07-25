import type { JobName } from '../models/job-name.enum';

/**
 * Every job is fully isolated and independently injectable — SchedulerService
 * knows nothing about broker logins, instrument refreshes, or the order
 * queue, only that it can `run()` a job. Adding a new job is a new class plus
 * one line in SchedulerModule's registry (same Rule Registry / Health
 * Indicator pattern from Phases 7-8), never a change to SchedulerService.
 */
export interface IScheduledJob {
  readonly name: JobName;
  run(): Promise<void>;
}
