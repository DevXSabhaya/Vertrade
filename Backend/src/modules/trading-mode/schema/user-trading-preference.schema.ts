import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

@Schema({
  collection: 'userTradingPreferences',
  timestamps: { createdAt: false, updatedAt: 'updatedAt' },
})
export class UserTradingPreferenceDocumentSchema {
  @Prop({ required: true, unique: true })
  userId!: string;

  @Prop({ required: true, enum: ['PAPER', 'LIVE'] })
  tradingMode!: 'PAPER' | 'LIVE';

  @Prop({ type: String, default: null })
  selectedBrokerAccountId!: string | null;

  updatedAt!: Date;
}

export type UserTradingPreferenceDocument =
  HydratedDocument<UserTradingPreferenceDocumentSchema>;
export const UserTradingPreferenceMongooseSchema = SchemaFactory.createForClass(
  UserTradingPreferenceDocumentSchema,
);
