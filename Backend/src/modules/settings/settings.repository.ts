import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Setting } from './settings.entity';
import type { ISettingsRepository } from './interfaces/settings-repository.interface';
import { SettingDocumentSchema, type SettingDocument } from './settings.schema';

@Injectable()
export class SettingsRepository implements ISettingsRepository {
  constructor(
    @InjectModel(SettingDocumentSchema.name)
    private readonly model: Model<SettingDocument>,
  ) {}

  async findAll(): Promise<Setting[]> {
    const docs = await this.model.find().exec();
    return docs.map((doc) => this.toEntity(doc));
  }

  async findByKey(key: string): Promise<Setting | null> {
    const doc = await this.model.findOne({ key }).exec();
    return doc ? this.toEntity(doc) : null;
  }

  async upsert(
    key: string,
    value: unknown,
    updatedBy?: string,
  ): Promise<Setting> {
    const doc = await this.model
      .findOneAndUpdate(
        { key },
        { $set: { value, updatedBy } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
    return this.toEntity(doc);
  }

  private toEntity(doc: SettingDocument): Setting {
    return new Setting(doc.key, doc.value, doc.updatedAt, doc.updatedBy);
  }
}
