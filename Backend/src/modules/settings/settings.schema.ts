import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, type HydratedDocument } from 'mongoose';

@Schema({
  collection: 'settings',
  timestamps: { createdAt: false, updatedAt: 'updatedAt' },
})
export class SettingDocumentSchema {
  @Prop({ required: true, unique: true })
  key!: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  value!: unknown;

  @Prop()
  updatedBy?: string;

  updatedAt!: Date;
}

export type SettingDocument = HydratedDocument<SettingDocumentSchema>;
export const SettingMongooseSchema = SchemaFactory.createForClass(
  SettingDocumentSchema,
);
