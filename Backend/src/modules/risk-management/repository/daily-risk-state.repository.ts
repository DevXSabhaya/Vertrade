import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { IDailyRiskStateRepository } from '../interfaces/daily-risk-state-repository.interface';
import type { DailyRiskState } from '../models/daily-risk-state.model';
import {
  DailyRiskStateDocumentSchema,
  type DailyRiskStateDocument,
} from './daily-risk-state.schema';

@Injectable()
export class DailyRiskStateRepository implements IDailyRiskStateRepository {
  constructor(
    @InjectModel(DailyRiskStateDocumentSchema.name)
    private readonly model: Model<DailyRiskStateDocument>,
  ) {}

  async save(state: DailyRiskState): Promise<void> {
    await this.model
      .updateOne(
        { tradeDate: state.tradeDate },
        { $set: { ...state } },
        { upsert: true },
      )
      .exec();
  }

  async find(tradeDate: string): Promise<DailyRiskState | null> {
    const doc = await this.model.findOne({ tradeDate }).exec();
    return doc
      ? {
          tradeDate: doc.tradeDate,
          realizedPnl: doc.realizedPnl,
          tradeCount: doc.tradeCount,
          consecutiveLosses: doc.consecutiveLosses,
          lastTradeWasLoss: doc.lastTradeWasLoss,
          updatedAt: doc.updatedAt,
        }
      : null;
  }
}
