import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { IEmergencyStopStateRepository } from '../interfaces/emergency-stop-state-repository.interface';
import type { EmergencyStopState } from '../models/emergency-stop-state.model';
import {
  EmergencyStopStateDocumentSchema,
  type EmergencyStopStateDocument,
} from './emergency-stop-state.schema';

const SINGLETON_ID = 'default';

@Injectable()
export class EmergencyStopStateRepository implements IEmergencyStopStateRepository {
  constructor(
    @InjectModel(EmergencyStopStateDocumentSchema.name)
    private readonly model: Model<EmergencyStopStateDocument>,
  ) {}

  async save(state: EmergencyStopState): Promise<void> {
    await this.model
      .updateOne(
        { singletonId: SINGLETON_ID },
        { $set: { singletonId: SINGLETON_ID, ...state } },
        { upsert: true },
      )
      .exec();
  }

  async find(): Promise<EmergencyStopState | null> {
    const doc = await this.model.findOne({ singletonId: SINGLETON_ID }).exec();
    return doc
      ? {
          active: doc.active,
          reason: doc.reason,
          triggeredBy: doc.triggeredBy,
          triggeredAt: doc.triggeredAt,
          resetAt: doc.resetAt,
          updatedAt: doc.updatedAt,
        }
      : null;
  }
}
