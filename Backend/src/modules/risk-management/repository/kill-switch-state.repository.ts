import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { IKillSwitchStateRepository } from '../interfaces/kill-switch-state-repository.interface';
import type { KillSwitchState } from '../models/kill-switch-state.model';
import {
  KillSwitchStateDocumentSchema,
  type KillSwitchStateDocument,
} from './kill-switch-state.schema';

const SINGLETON_ID = 'default';

@Injectable()
export class KillSwitchStateRepository implements IKillSwitchStateRepository {
  constructor(
    @InjectModel(KillSwitchStateDocumentSchema.name)
    private readonly model: Model<KillSwitchStateDocument>,
  ) {}

  async save(state: KillSwitchState): Promise<void> {
    await this.model
      .updateOne(
        { singletonId: SINGLETON_ID },
        { $set: { singletonId: SINGLETON_ID, ...state } },
        { upsert: true },
      )
      .exec();
  }

  async find(): Promise<KillSwitchState | null> {
    const doc = await this.model.findOne({ singletonId: SINGLETON_ID }).exec();
    return doc
      ? {
          status: doc.status,
          reason: doc.reason,
          activatedBy: doc.activatedBy,
          activatedAt: doc.activatedAt,
          deactivatedAt: doc.deactivatedAt,
          updatedAt: doc.updatedAt,
        }
      : null;
  }
}
