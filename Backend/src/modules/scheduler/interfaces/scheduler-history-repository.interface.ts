import type { JobResult } from '../models/job-result.model';

export interface ISchedulerHistoryRepository {
  save(result: JobResult): Promise<void>;
  findRecent(limit: number): Promise<JobResult[]>;
  findLastSuccessful(jobName: string): Promise<JobResult | null>;
}
