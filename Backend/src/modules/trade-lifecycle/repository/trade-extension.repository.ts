import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { ITradeExtensionRepository } from '../interfaces/trade-extension-repository.interface';
import type { TradeExtension } from '../models/trade-extension.model';
import type { TrailingConfiguration } from '../models/trailing-configuration.model';
import {
  TradeExtensionDocumentSchema,
  type TradeExtensionDocument,
} from './trade-extension.schema';

@Injectable()
export class TradeExtensionRepository implements ITradeExtensionRepository {
  constructor(
    @InjectModel(TradeExtensionDocumentSchema.name)
    private readonly model: Model<TradeExtensionDocument>,
  ) {}

  async save(extension: TradeExtension): Promise<void> {
    await this.model
      .updateOne(
        { tradeId: extension.tradeId },
        {
          $set: {
            tradeId: extension.tradeId,
            brokerPositionId: extension.brokerPositionId,
            brokerMetadata: extension.brokerMetadata,
            exitReason: extension.exitReason,
            trailingEnabled: extension.trailingEnabled,
            trailingConfig: extension.trailingConfig,
            targetExitQuantities: extension.targetExitQuantities,
            lastTrailingStepPrice: extension.lastTrailingStepPrice,
            createdAt: extension.createdAt,
            updatedAt: extension.updatedAt,
          },
        },
        { upsert: true },
      )
      .exec();
  }

  async find(tradeId: string): Promise<TradeExtension | null> {
    const doc = await this.model.findOne({ tradeId }).exec();
    return doc ? this.toExtension(doc) : null;
  }

  async findAll(tradeIds: readonly string[]): Promise<TradeExtension[]> {
    if (tradeIds.length === 0) {
      return [];
    }
    const docs = await this.model
      .find({ tradeId: { $in: tradeIds as string[] } })
      .exec();
    return docs.map((doc) => this.toExtension(doc));
  }

  private toExtension(doc: TradeExtensionDocument): TradeExtension {
    return {
      tradeId: doc.tradeId,
      brokerPositionId: doc.brokerPositionId,
      brokerMetadata: doc.brokerMetadata as Record<string, unknown>,
      exitReason: doc.exitReason,
      trailingEnabled: doc.trailingEnabled,
      trailingConfig: doc.trailingConfig as TrailingConfiguration | null,
      targetExitQuantities: doc.targetExitQuantities,
      lastTrailingStepPrice: doc.lastTrailingStepPrice,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
