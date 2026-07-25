import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { RecoveryStep } from '../models/recovery-step.enum';

@Schema({ collection: 'recoveryHistory' })
export class RecoveryHistoryDocumentSchema {
  @Prop({ required: true, unique: true }) recoveryId!: string;
  @Prop({ required: true }) startedAt!: string;
  @Prop({ type: String, default: null }) completedAt!: string | null;
  @Prop({ type: Boolean, default: null }) succeeded!: boolean | null;
  @Prop({ required: true }) finalState!: string;
  @Prop({ type: Number, default: null }) durationMs!: number | null;
  @Prop({ type: String, default: null }) failureReason!: string | null;
  @Prop({ type: String, enum: RecoveryStep, default: null })
  failedStep!: RecoveryStep | null;
  @Prop({ type: [String], default: [] }) stepsCompleted!: RecoveryStep[];
  @Prop({ required: true, default: 0 }) tradesRecovered!: number;
  @Prop({ required: true, default: 0 }) queueItemsRecovered!: number;
}

export type RecoveryHistoryDocument =
  HydratedDocument<RecoveryHistoryDocumentSchema>;
export const RecoveryHistoryMongooseSchema = SchemaFactory.createForClass(
  RecoveryHistoryDocumentSchema,
);
RecoveryHistoryMongooseSchema.index({ startedAt: -1 });
RecoveryHistoryMongooseSchema.index({ succeeded: 1, completedAt: 1 });
