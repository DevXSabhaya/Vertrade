import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { IRecoveryHistoryRepository } from '../interfaces/recovery-history-repository.interface';
import type { RecoveryHistoryEntry } from '../models/recovery-history-entry.model';
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

  async save(entry: RecoveryHistoryEntry): Promise<void> {
    await this.model
      .updateOne(
        { recoveryId: entry.id },
        {
          $set: {
            recoveryId: entry.id,
            startedAt: entry.startedAt,
            completedAt: entry.completedAt,
            succeeded: entry.succeeded,
            finalState: entry.finalState,
            durationMs: entry.durationMs,
            failureReason: entry.failureReason,
            failedStep: entry.failedStep,
            stepsCompleted: entry.stepsCompleted,
            tradesRecovered: entry.tradesRecovered,
            queueItemsRecovered: entry.queueItemsRecovered,
          },
        },
        { upsert: true },
      )
      .exec();
  }

  async findRecent(limit: number): Promise<RecoveryHistoryEntry[]> {
    const docs = await this.model
      .find()
      .sort({ startedAt: -1 })
      .limit(limit)
      .exec();
    return docs.map((doc) => this.toEntry(doc));
  }

  async findLastSuccessful(): Promise<RecoveryHistoryEntry | null> {
    const doc = await this.model
      .findOne({ succeeded: true })
      .sort({ completedAt: -1 })
      .exec();
    return doc ? this.toEntry(doc) : null;
  }

  async findLastIncomplete(): Promise<RecoveryHistoryEntry | null> {
    const doc = await this.model
      .findOne({ succeeded: null })
      .sort({ startedAt: -1 })
      .exec();
    return doc ? this.toEntry(doc) : null;
  }

  private toEntry(doc: RecoveryHistoryDocument): RecoveryHistoryEntry {
    return {
      id: doc.recoveryId,
      startedAt: doc.startedAt,
      completedAt: doc.completedAt,
      succeeded: doc.succeeded,
      finalState: doc.finalState,
      durationMs: doc.durationMs,
      failureReason: doc.failureReason,
      failedStep: doc.failedStep,
      stepsCompleted: doc.stepsCompleted,
      tradesRecovered: doc.tradesRecovered,
      queueItemsRecovered: doc.queueItemsRecovered,
    };
  }
}
