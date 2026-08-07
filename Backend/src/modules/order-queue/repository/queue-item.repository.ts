import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { ResolvedInstrument } from '@modules/instrument-resolver/resolved-instrument.vo';
import type { TradeValidationRequest } from '@modules/trade-validation/models/trade-validation-request.model';
import type { IQueueItemRepository } from '../interfaces/queue-item-repository.interface';
import type { QueueItemSnapshot } from '../models/queue-item-snapshot';
import { QueueItemState } from '../models/queue-item-state.enum';
import { QueueItemTransitions } from '../models/queue-item-transitions';
import {
  QueueItemDocumentSchema,
  type QueueItemDocument,
} from './queue-item.schema';

@Injectable()
export class QueueItemRepository implements IQueueItemRepository {
  constructor(
    @InjectModel(QueueItemDocumentSchema.name)
    private readonly model: Model<QueueItemDocument>,
  ) {}

  async save(snapshot: QueueItemSnapshot): Promise<void> {
    await this.model
      .updateOne(
        { idempotencyKey: snapshot.idempotencyKey },
        {
          $set: {
            itemId: snapshot.id,
            userId: snapshot.userId,
            idempotencyKey: snapshot.idempotencyKey,
            orderType: snapshot.orderType,
            state: snapshot.state,
            request: snapshot.request,
            resolvedInstrument: snapshot.resolvedInstrument,
            attempts: snapshot.attempts,
            lockOwner: snapshot.lockOwner,
            lockedAt: snapshot.lockedAt ? new Date(snapshot.lockedAt) : null,
            lastError: snapshot.lastError,
            resultTradeId: snapshot.resultTradeId,
            history: snapshot.history,
            createdAt: snapshot.createdAt,
            updatedAt: snapshot.updatedAt,
          },
        },
        { upsert: true },
      )
      .exec();
  }

  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<QueueItemSnapshot | null> {
    const doc = await this.model.findOne({ idempotencyKey }).exec();
    return doc ? this.toSnapshot(doc) : null;
  }

  async findRecoverable(): Promise<QueueItemSnapshot[]> {
    const nonTerminalStates = Object.values(QueueItemState).filter(
      (state) => !QueueItemTransitions.isTerminal(state),
    );
    const docs = await this.model
      .find({ state: { $in: nonTerminalStates } })
      .exec();
    return docs.map((doc) => this.toSnapshot(doc));
  }

  private toSnapshot(doc: QueueItemDocument): QueueItemSnapshot {
    return {
      id: doc.itemId,
      userId: doc.userId,
      idempotencyKey: doc.idempotencyKey,
      orderType: doc.orderType,
      state: doc.state,
      request: doc.request as unknown as TradeValidationRequest,
      resolvedInstrument:
        doc.resolvedInstrument as unknown as ResolvedInstrument,
      attempts: doc.attempts,
      lockOwner: doc.lockOwner,
      lockedAt: doc.lockedAt ? doc.lockedAt.toISOString() : null,
      lastError: doc.lastError,
      resultTradeId: doc.resultTradeId,
      history: doc.history,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
