import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { IPaperTradeOwnershipRepository } from '../interfaces/paper-trade-ownership-repository.interface';
import type { PaperTradeOwnership } from '../models/paper-trade-ownership.model';
import type { PaperTradeStatus } from '../models/paper-trade-status.enum';
import {
  PaperTradeOwnershipDocumentSchema,
  type PaperTradeOwnershipDocument,
} from '../schema/paper-trade-ownership.schema';

@Injectable()
export class PaperTradeOwnershipRepository implements IPaperTradeOwnershipRepository {
  constructor(
    @InjectModel(PaperTradeOwnershipDocumentSchema.name)
    private readonly model: Model<PaperTradeOwnershipDocument>,
  ) {}

  async save(ownership: PaperTradeOwnership): Promise<void> {
    await this.model
      .updateOne(
        { tradeOwnershipId: ownership.id },
        {
          $set: {
            tradeOwnershipId: ownership.id,
            userId: ownership.userId,
            idempotencyKey: ownership.idempotencyKey,
            queueItemId: ownership.queueItemId,
            tradeId: ownership.tradeId,
            status: ownership.status,
            reservedAmount: ownership.reservedAmount,
            rawSymbol: ownership.rawSymbol,
            direction: ownership.direction,
            quantity: ownership.quantity,
            entryTriggerPrice: ownership.entryTriggerPrice,
            initialStopLoss: ownership.initialStopLoss,
            isMarketOrder: ownership.isMarketOrder,
            trailingConfig: ownership.trailingConfig,
            failureReason: ownership.failureReason,
            createdAt: ownership.createdAt,
            updatedAt: ownership.updatedAt,
          },
        },
        { upsert: true },
      )
      .exec();
  }

  async findById(id: string): Promise<PaperTradeOwnership | null> {
    const doc = await this.model.findOne({ tradeOwnershipId: id }).exec();
    return doc ? this.toOwnership(doc) : null;
  }

  async findByQueueItemId(
    queueItemId: string,
  ): Promise<PaperTradeOwnership | null> {
    const doc = await this.model.findOne({ queueItemId }).exec();
    return doc ? this.toOwnership(doc) : null;
  }

  async findByTradeId(tradeId: string): Promise<PaperTradeOwnership | null> {
    const doc = await this.model.findOne({ tradeId }).exec();
    return doc ? this.toOwnership(doc) : null;
  }

  async listByUser(
    userId: string,
    limit: number,
  ): Promise<PaperTradeOwnership[]> {
    const docs = await this.model
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
    return docs.map((doc) => this.toOwnership(doc));
  }

  async countByUserAndStatuses(
    userId: string,
    statuses: readonly PaperTradeStatus[],
  ): Promise<number> {
    return this.model
      .countDocuments({ userId, status: { $in: statuses } })
      .exec();
  }

  private toOwnership(doc: PaperTradeOwnershipDocument): PaperTradeOwnership {
    return {
      id: doc.tradeOwnershipId,
      userId: doc.userId,
      idempotencyKey: doc.idempotencyKey,
      queueItemId: doc.queueItemId,
      tradeId: doc.tradeId,
      status: doc.status,
      reservedAmount: doc.reservedAmount,
      rawSymbol: doc.rawSymbol,
      direction: doc.direction,
      quantity: doc.quantity,
      entryTriggerPrice: doc.entryTriggerPrice,
      initialStopLoss: doc.initialStopLoss,
      isMarketOrder: doc.isMarketOrder,
      trailingConfig: doc.trailingConfig,
      failureReason: doc.failureReason,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
