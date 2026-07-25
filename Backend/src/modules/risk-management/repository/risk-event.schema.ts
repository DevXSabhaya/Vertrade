import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, type HydratedDocument } from 'mongoose';

@Schema({ collection: 'riskEvents' })
export class RiskEventDocumentSchema {
  @Prop({ required: true, unique: true }) eventId!: string;
  @Prop({ required: true }) eventName!: string;
  @Prop({ required: true }) occurredAt!: string;
  @Prop({ type: String, default: null }) correlationId!: string | null;
  @Prop({ type: String, default: null }) tradeId!: string | null;
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} }) payload!: unknown;
}

export type RiskEventDocument = HydratedDocument<RiskEventDocumentSchema>;
export const RiskEventMongooseSchema = SchemaFactory.createForClass(
  RiskEventDocumentSchema,
);
RiskEventMongooseSchema.index({ occurredAt: -1 });
