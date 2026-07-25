import { JobRegistry } from './job-registry';
import { JobName } from './models/job-name.enum';
import { JobNotFoundException } from './exceptions/job-not-found.exception';
import type { IScheduledJob } from './interfaces/scheduled-job.interface';

function fakeJob(name: JobName): IScheduledJob {
  return { name, run: jest.fn().mockResolvedValue(undefined) };
}

describe('JobRegistry', () => {
  it('resolves a registered job by name', () => {
    const job = fakeJob(JobName.HEALTH_CHECK);
    const registry = new JobRegistry([job]);
    expect(registry.get(JobName.HEALTH_CHECK)).toBe(job);
  });

  it('throws JobNotFoundException for an unregistered job', () => {
    const registry = new JobRegistry([fakeJob(JobName.HEALTH_CHECK)]);
    expect(() => registry.get(JobName.CLEANUP)).toThrow(JobNotFoundException);
  });

  it('getAll() returns every registered job', () => {
    const jobs = [fakeJob(JobName.HEALTH_CHECK), fakeJob(JobName.CLEANUP)];
    const registry = new JobRegistry(jobs);
    expect(registry.getAll()).toHaveLength(2);
  });
});
