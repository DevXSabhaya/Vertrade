import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { FeatureFlag } from './feature-flag.entity';
import type { IFeatureFlagRepository } from './interfaces/feature-flag-repository.interface';
import {
  FeatureFlagDocumentSchema,
  type FeatureFlagDocument,
} from './feature-flag.schema';

@Injectable()
export class FeatureFlagRepository implements IFeatureFlagRepository {
  constructor(
    @InjectModel(FeatureFlagDocumentSchema.name)
    private readonly model: Model<FeatureFlagDocument>,
  ) {}

  async findAll(): Promise<FeatureFlag[]> {
    const docs = await this.model.find().exec();
    return docs.map((doc) => this.toEntity(doc));
  }

  async findByName(name: string): Promise<FeatureFlag | null> {
    const doc = await this.model.findOne({ name }).exec();
    return doc ? this.toEntity(doc) : null;
  }

  async upsert(name: string, enabled: boolean): Promise<FeatureFlag> {
    const doc = await this.model
      .findOneAndUpdate(
        { name },
        { $set: { enabled } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
    return this.toEntity(doc);
  }

  private toEntity(doc: FeatureFlagDocument): FeatureFlag {
    return new FeatureFlag(doc.name, doc.enabled, doc.updatedAt);
  }
}
