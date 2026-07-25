import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { ISchedulerHistoryRepository } from '../interfaces/scheduler-history-repository.interface';
import type { JobResult } from '../models/job-result.model';
import {
  SchedulerHistoryDocumentSchema,
  type SchedulerHistoryDocument,
} from './scheduler-history.schema';

@Injectable()
export class SchedulerHistoryRepository implements ISchedulerHistoryRepository {
  constructor(
    @InjectModel(SchedulerHistoryDocumentSchema.name)
    private readonly model: Model<SchedulerHistoryDocument>,
  ) {}

  async save(result: JobResult): Promise<void> {
    await this.model.create({ ...result });
  }

  async findRecent(limit: number): Promise<JobResult[]> {
    const docs = await this.model
      .find()
      .sort({ startedAt: -1 })
      .limit(limit)
      .exec();
    return docs.map((doc) => this.toResult(doc));
  }

  async findLastSuccessful(jobName: string): Promise<JobResult | null> {
    const doc = await this.model
      .findOne({ jobName, succeeded: true })
      .sort({ startedAt: -1 })
      .exec();
    return doc ? this.toResult(doc) : null;
  }

  private toResult(doc: SchedulerHistoryDocument): JobResult {
    return {
      jobName: doc.jobName,
      succeeded: doc.succeeded,
      startedAt: doc.startedAt,
      finishedAt: doc.finishedAt,
      durationMs: doc.durationMs,
      error: doc.error,
    };
  }
}
