import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { RiskReasonCode } from '../models/risk-reason-code.enum';

@Schema({ collection: 'riskViolations' })
export class RiskViolationDocumentSchema {
  @Prop({ required: true, unique: true }) violationId!: string;
  @Prop({ required: true }) occurredAt!: string;
  @Prop({ required: true, type: String, enum: RiskReasonCode })
  reasonCode!: RiskReasonCode;
  @Prop({ required: true }) message!: string;
  @Prop({ required: true }) rawSymbol!: string;
  @Prop({ required: true }) requestedQuantity!: number;
  @Prop({ type: String, default: null }) correlationId!: string | null;
}

export type RiskViolationDocument =
  HydratedDocument<RiskViolationDocumentSchema>;
export const RiskViolationMongooseSchema = SchemaFactory.createForClass(
  RiskViolationDocumentSchema,
);
RiskViolationMongooseSchema.index({ occurredAt: -1 });
