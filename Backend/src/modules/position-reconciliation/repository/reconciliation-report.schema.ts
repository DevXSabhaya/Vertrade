import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { MismatchLevel } from '../models/mismatch-level.enum';
import type { PositionMismatch } from '../models/position-mismatch.model';

@Schema({ collection: 'reconciliationReports' })
export class ReconciliationReportDocumentSchema {
  @Prop({ required: true, unique: true }) reportId!: string;
  @Prop({ required: true }) tradeId!: string;
  @Prop({ required: true }) generatedAt!: string;
  @Prop({ required: true, type: [Object], default: [] })
  mismatches!: PositionMismatch[];
  @Prop({ required: true, type: String, enum: MismatchLevel })
  overallLevel!: MismatchLevel;
  @Prop({ required: true, default: false }) autoRepaired!: boolean;
  @Prop({ required: true, default: false }) manualReviewRequired!: boolean;
}

export type ReconciliationReportDocument =
  HydratedDocument<ReconciliationReportDocumentSchema>;
export const ReconciliationReportMongooseSchema = SchemaFactory.createForClass(
  ReconciliationReportDocumentSchema,
);
ReconciliationReportMongooseSchema.index({ generatedAt: -1 });
ReconciliationReportMongooseSchema.index({ tradeId: 1, generatedAt: -1 });
