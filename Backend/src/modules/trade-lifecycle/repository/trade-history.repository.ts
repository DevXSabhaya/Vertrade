import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { ITradeHistoryRepository } from '../interfaces/trade-history-repository.interface';
import type { TradeRecord } from '../models/trade-record.model';
import type { TrailingConfiguration } from '../models/trailing-configuration.model';
import {
  TradeHistoryDocumentSchema,
  type TradeHistoryDocument,
} from './trade-history.schema';

@Injectable()
export class TradeHistoryRepository implements ITradeHistoryRepository {
  constructor(
    @InjectModel(TradeHistoryDocumentSchema.name)
    private readonly model: Model<TradeHistoryDocument>,
  ) {}

  async save(record: TradeRecord): Promise<void> {
    await this.model
      .updateOne(
        { tradeId: record.tradeId },
        { $set: { ...record } },
        { upsert: true },
      )
      .exec();
  }

  async findAll(limit: number, offset: number): Promise<TradeRecord[]> {
    const docs = await this.model
      .find()
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .exec();
    return docs.map((doc) => this.toRecord(doc));
  }

  async findById(tradeId: string): Promise<TradeRecord | null> {
    const doc = await this.model.findOne({ tradeId }).exec();
    return doc ? this.toRecord(doc) : null;
  }

  private toRecord(doc: TradeHistoryDocument): TradeRecord {
    return {
      tradeId: doc.tradeId,
      signalId: doc.signalId,
      brokerOrderId: doc.brokerOrderId,
      brokerPositionId: doc.brokerPositionId,
      instrument: doc.instrument,
      exchange: doc.exchange,
      token: doc.token,
      direction: doc.direction,
      entryPrice: doc.entryPrice,
      quantity: doc.quantity,
      filledQuantity: doc.filledQuantity,
      openQuantity: doc.openQuantity,
      exitedQuantity: doc.exitedQuantity,
      averagePrice: doc.averagePrice,
      exitPrice: doc.exitPrice,
      status: doc.status,
      lifecycleStage: doc.lifecycleStage,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      targets: doc.targets as number[],
      currentTarget: doc.currentTarget,
      stopLoss: doc.stopLoss,
      currentStopLoss: doc.currentStopLoss,
      trailingEnabled: doc.trailingEnabled,
      trailingConfiguration:
        doc.trailingConfiguration as TrailingConfiguration | null,
      riskReward: doc.riskReward,
      realizedPnl: doc.realizedPnl,
      unrealizedPnl: doc.unrealizedPnl,
      exitReason: doc.exitReason,
      brokerMetadata: doc.brokerMetadata as Record<string, unknown>,
      positionDurationMs: doc.positionDurationMs,
      mode: doc.mode ?? 'PAPER',
    };
  }
}
