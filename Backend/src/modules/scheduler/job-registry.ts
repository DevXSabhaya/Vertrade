import { Inject, Injectable } from '@nestjs/common';
import type { IScheduledJob } from './interfaces/scheduled-job.interface';
import type { JobName } from './models/job-name.enum';
import { SCHEDULED_JOBS } from './scheduler.constants';
import { JobNotFoundException } from './exceptions/job-not-found.exception';

/** Same Rule Registry pattern as Phase 7's TradeValidationModule. */
@Injectable()
export class JobRegistry {
  private readonly byName: ReadonlyMap<JobName, IScheduledJob>;

  constructor(@Inject(SCHEDULED_JOBS) jobs: IScheduledJob[]) {
    this.byName = new Map(jobs.map((job) => [job.name, job]));
  }

  get(name: JobName): IScheduledJob {
    const job = this.byName.get(name);
    if (!job) {
      throw new JobNotFoundException(`No scheduled job registered for ${name}`);
    }
    return job;
  }

  getAll(): readonly IScheduledJob[] {
    return Array.from(this.byName.values());
  }
}
