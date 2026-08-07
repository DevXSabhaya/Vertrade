import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { UserTradingPreference } from '../models/user-trading-preference.model';
import type { IUserTradingPreferenceRepository } from './user-trading-preference-repository.interface';
import {
  UserTradingPreferenceDocumentSchema,
  type UserTradingPreferenceDocument,
} from '../schema/user-trading-preference.schema';

@Injectable()
export class UserTradingPreferenceRepository implements IUserTradingPreferenceRepository {
  constructor(
    @InjectModel(UserTradingPreferenceDocumentSchema.name)
    private readonly model: Model<UserTradingPreferenceDocument>,
  ) {}

  async find(userId: string): Promise<UserTradingPreference | null> {
    const doc = await this.model.findOne({ userId }).exec();
    return doc ? this.toDomain(doc) : null;
  }

  async findAllLiveWithBroker(): Promise<UserTradingPreference[]> {
    const docs = await this.model
      .find({
        tradingMode: 'LIVE',
        selectedBrokerAccountId: { $ne: null },
      })
      .exec();
    return docs.map((doc) => this.toDomain(doc));
  }

  async upsert(
    userId: string,
    patch: {
      tradingMode: 'PAPER' | 'LIVE';
      selectedBrokerAccountId: string | null;
    },
  ): Promise<UserTradingPreference> {
    const doc = await this.model
      .findOneAndUpdate(
        { userId },
        { $set: { ...patch } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
    return this.toDomain(doc);
  }

  private toDomain(doc: UserTradingPreferenceDocument): UserTradingPreference {
    return {
      userId: doc.userId,
      tradingMode: doc.tradingMode,
      selectedBrokerAccountId: doc.selectedBrokerAccountId,
      updatedAt: doc.updatedAt,
    };
  }
}
