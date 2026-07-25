import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { IRecoveryHistoryRepository } from '../interfaces/recovery-history-repository.interface';
import type { RecoveryAttemptRecord } from '../models/recovery-attempt-record.model';
import {
  RecoveryHistoryDocumentSchema,
  type RecoveryHistoryDocument,
} from './recovery-history.schema';

@Injectable()
export class RecoveryHistoryRepository implements IRecoveryHistoryRepository {
  constructor(
    @InjectModel(RecoveryHistoryDocumentSchema.name)
    private readonly model: Model<RecoveryHistoryDocument>,
  ) {}

  async save(record: RecoveryAttemptRecord): Promise<void> {
    await this.model.create({ ...record });
  }

  async findRecent(limit: number): Promise<RecoveryAttemptRecord[]> {
    const docs = await this.model
      .find()
      .sort({ startedAt: -1 })
      .limit(limit)
      .exec();
    return docs.map((doc) => ({
      reason: doc.reason,
      startedAt: doc.startedAt,
      finishedAt: doc.finishedAt,
      succeeded: doc.succeeded,
      error: doc.error,
    }));
  }
}
