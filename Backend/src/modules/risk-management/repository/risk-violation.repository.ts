import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { IRiskViolationRepository } from '../interfaces/risk-violation-repository.interface';
import type { RiskViolation } from '../models/risk-violation.model';
import {
  RiskViolationDocumentSchema,
  type RiskViolationDocument,
} from './risk-violation.schema';

@Injectable()
export class RiskViolationRepository implements IRiskViolationRepository {
  constructor(
    @InjectModel(RiskViolationDocumentSchema.name)
    private readonly model: Model<RiskViolationDocument>,
  ) {}

  async save(violation: RiskViolation): Promise<void> {
    await this.model.create({
      violationId: violation.id,
      occurredAt: violation.occurredAt,
      reasonCode: violation.reasonCode,
      message: violation.message,
      rawSymbol: violation.rawSymbol,
      requestedQuantity: violation.requestedQuantity,
      correlationId: violation.correlationId,
    });
  }

  async findRecent(limit: number): Promise<RiskViolation[]> {
    const docs = await this.model
      .find()
      .sort({ occurredAt: -1 })
      .limit(limit)
      .exec();
    return docs.map((doc) => ({
      id: doc.violationId,
      occurredAt: doc.occurredAt,
      reasonCode: doc.reasonCode,
      message: doc.message,
      rawSymbol: doc.rawSymbol,
      requestedQuantity: doc.requestedQuantity,
      correlationId: doc.correlationId,
    }));
  }
}
