import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

@Schema({
  collection: 'featureFlags',
  timestamps: { createdAt: false, updatedAt: 'updatedAt' },
})
export class FeatureFlagDocumentSchema {
  @Prop({ required: true, unique: true })
  name!: string;

  @Prop({ required: true, default: false })
  enabled!: boolean;

  updatedAt!: Date;
}

export type FeatureFlagDocument = HydratedDocument<FeatureFlagDocumentSchema>;
export const FeatureFlagMongooseSchema = SchemaFactory.createForClass(
  FeatureFlagDocumentSchema,
);
