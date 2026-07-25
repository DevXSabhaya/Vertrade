import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { IRecoveryErrorRepository } from '../interfaces/recovery-error-repository.interface';
import type { RecoveryErrorRecord } from '../models/recovery-error-record.model';
import {
  RecoveryErrorDocumentSchema,
  type RecoveryErrorDocument,
} from './recovery-error.schema';

@Injectable()
export class RecoveryErrorRepository implements IRecoveryErrorRepository {
  constructor(
    @InjectModel(RecoveryErrorDocumentSchema.name)
    private readonly model: Model<RecoveryErrorDocument>,
  ) {}

  async save(record: RecoveryErrorRecord): Promise<void> {
    await this.model.create({
      errorId: record.id,
      recoveryId: record.recoveryId,
      occurredAt: record.occurredAt,
      step: record.step,
      message: record.message,
      attempt: record.attempt,
    });
  }

  async findRecent(limit: number): Promise<RecoveryErrorRecord[]> {
    const docs = await this.model
      .find()
      .sort({ occurredAt: -1 })
      .limit(limit)
      .exec();
    return docs.map((doc) => ({
      id: doc.errorId,
      recoveryId: doc.recoveryId,
      occurredAt: doc.occurredAt,
      step: doc.step,
      message: doc.message,
      attempt: doc.attempt,
    }));
  }
}
