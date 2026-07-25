import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { RecoveryStep } from '../models/recovery-step.enum';

@Schema({ collection: 'recoveryErrors' })
export class RecoveryErrorDocumentSchema {
  @Prop({ required: true, unique: true }) errorId!: string;
  @Prop({ required: true }) recoveryId!: string;
  @Prop({ required: true }) occurredAt!: string;
  @Prop({ required: true, type: String, enum: RecoveryStep })
  step!: RecoveryStep;
  @Prop({ required: true }) message!: string;
  @Prop({ required: true }) attempt!: number;
}

export type RecoveryErrorDocument =
  HydratedDocument<RecoveryErrorDocumentSchema>;
export const RecoveryErrorMongooseSchema = SchemaFactory.createForClass(
  RecoveryErrorDocumentSchema,
);
RecoveryErrorMongooseSchema.index({ recoveryId: 1, occurredAt: -1 });
