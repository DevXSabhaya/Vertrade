import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { IRiskEventRepository } from '../interfaces/risk-event-repository.interface';
import type { RiskEventRecord } from '../models/risk-event-record.model';
import {
  RiskEventDocumentSchema,
  type RiskEventDocument,
} from './risk-event.schema';

@Injectable()
export class RiskEventRepository implements IRiskEventRepository {
  constructor(
    @InjectModel(RiskEventDocumentSchema.name)
    private readonly model: Model<RiskEventDocument>,
  ) {}

  async save(record: RiskEventRecord): Promise<void> {
    await this.model.create({
      eventId: record.id,
      eventName: record.eventName,
      occurredAt: record.occurredAt,
      correlationId: record.correlationId,
      tradeId: record.tradeId,
      payload: record.payload,
    });
  }

  async findRecent(limit: number): Promise<RiskEventRecord[]> {
    const docs = await this.model
      .find()
      .sort({ occurredAt: -1 })
      .limit(limit)
      .exec();
    return docs.map((doc) => ({
      id: doc.eventId,
      eventName: doc.eventName,
      occurredAt: doc.occurredAt,
      correlationId: doc.correlationId,
      tradeId: doc.tradeId,
      payload: doc.payload as Record<string, unknown>,
    }));
  }
}
