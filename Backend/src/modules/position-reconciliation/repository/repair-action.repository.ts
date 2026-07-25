import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { IRepairActionRepository } from '../interfaces/repair-action-repository.interface';
import type { RepairAction } from '../models/repair-action.model';
import {
  RepairActionDocumentSchema,
  type RepairActionDocument,
} from './repair-action.schema';

@Injectable()
export class RepairActionRepository implements IRepairActionRepository {
  constructor(
    @InjectModel(RepairActionDocumentSchema.name)
    private readonly model: Model<RepairActionDocument>,
  ) {}

  async save(action: RepairAction): Promise<void> {
    await this.model.create({
      actionId: action.id,
      tradeId: action.tradeId,
      reportId: action.reportId,
      field: action.field,
      previousValue: action.previousValue,
      newValue: action.newValue,
      appliedAt: action.appliedAt,
      succeeded: action.succeeded,
      reason: action.reason,
    });
  }

  async findRecent(limit: number): Promise<RepairAction[]> {
    const docs = await this.model
      .find()
      .sort({ appliedAt: -1 })
      .limit(limit)
      .exec();
    return docs.map((doc) => ({
      id: doc.actionId,
      tradeId: doc.tradeId,
      reportId: doc.reportId,
      field: doc.field,
      previousValue: doc.previousValue,
      newValue: doc.newValue,
      appliedAt: doc.appliedAt,
      succeeded: doc.succeeded,
      reason: doc.reason,
    }));
  }
}
