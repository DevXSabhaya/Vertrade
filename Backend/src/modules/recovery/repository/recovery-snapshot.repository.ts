import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { TradeSnapshot } from '@modules/trading-engine/domain/trade-snapshot';
import type { QueueItemSnapshot } from '@modules/order-queue/models/queue-item-snapshot';
import type { IRecoverySnapshotRepository } from '../interfaces/recovery-snapshot-repository.interface';
import type {
  RecoveryActiveBrokerSession,
  RecoveryLastTick,
  RecoveryMarketSubscription,
  RecoverySnapshot,
} from '../models/recovery-snapshot.model';
import {
  RecoverySnapshotDocumentSchema,
  type RecoverySnapshotDocument,
} from './recovery-snapshot.schema';

@Injectable()
export class RecoverySnapshotRepository implements IRecoverySnapshotRepository {
  constructor(
    @InjectModel(RecoverySnapshotDocumentSchema.name)
    private readonly model: Model<RecoverySnapshotDocument>,
  ) {}

  async save(snapshot: RecoverySnapshot): Promise<void> {
    await this.model
      .updateOne(
        { snapshotId: snapshot.id },
        {
          $set: {
            snapshotId: snapshot.id,
            capturedAt: snapshot.capturedAt,
            trades: snapshot.trades,
            queueItems: snapshot.queueItems,
            idempotencyKeys: snapshot.idempotencyKeys,
            marketSubscriptions: snapshot.marketSubscriptions,
            engineStateSummary: snapshot.engineStateSummary,
            activeBrokerSessions: snapshot.activeBrokerSessions,
            lastTick: snapshot.lastTick,
          },
        },
        { upsert: true },
      )
      .exec();
  }

  async findLatest(): Promise<RecoverySnapshot | null> {
    const doc = await this.model.findOne().sort({ capturedAt: -1 }).exec();
    return doc ? this.toSnapshot(doc) : null;
  }

  private toSnapshot(doc: RecoverySnapshotDocument): RecoverySnapshot {
    return {
      id: doc.snapshotId,
      capturedAt: doc.capturedAt,
      trades: doc.trades as TradeSnapshot[],
      queueItems: doc.queueItems as QueueItemSnapshot[],
      idempotencyKeys: doc.idempotencyKeys,
      marketSubscriptions:
        doc.marketSubscriptions as RecoveryMarketSubscription[],
      engineStateSummary: doc.engineStateSummary,
      activeBrokerSessions:
        doc.activeBrokerSessions as RecoveryActiveBrokerSession[],
      lastTick: doc.lastTick as unknown as RecoveryLastTick | null,
    };
  }
}
