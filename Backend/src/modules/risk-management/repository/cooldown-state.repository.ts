import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { ICooldownStateRepository } from '../interfaces/cooldown-state-repository.interface';
import type { CooldownState } from '../models/cooldown.model';
import {
  CooldownStateDocumentSchema,
  type CooldownStateDocument,
} from './cooldown-state.schema';

const SINGLETON_ID = 'default';

@Injectable()
export class CooldownStateRepository implements ICooldownStateRepository {
  constructor(
    @InjectModel(CooldownStateDocumentSchema.name)
    private readonly model: Model<CooldownStateDocument>,
  ) {}

  async save(state: CooldownState | null): Promise<void> {
    if (state === null) {
      await this.model.deleteOne({ singletonId: SINGLETON_ID }).exec();
      return;
    }
    await this.model
      .updateOne(
        { singletonId: SINGLETON_ID },
        { $set: { singletonId: SINGLETON_ID, ...state } },
        { upsert: true },
      )
      .exec();
  }

  async find(): Promise<CooldownState | null> {
    const doc = await this.model.findOne({ singletonId: SINGLETON_ID }).exec();
    return doc
      ? {
          reason: doc.reason,
          startedAt: doc.startedAt,
          expiresAt: doc.expiresAt,
        }
      : null;
  }
}
