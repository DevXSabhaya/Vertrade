import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

@Schema({ collection: 'recoveryHistory' })
export class RecoveryHistoryDocumentSchema {
  @Prop({ required: true })
  reason!: string;

  @Prop({ required: true })
  startedAt!: string;

  @Prop({ required: true })
  finishedAt!: string;

  @Prop({ required: true })
  succeeded!: boolean;

  @Prop({ type: String, default: null })
  error!: string | null;
}

export type RecoveryHistoryDocument =
  HydratedDocument<RecoveryHistoryDocumentSchema>;
export const RecoveryHistoryMongooseSchema = SchemaFactory.createForClass(
  RecoveryHistoryDocumentSchema,
);
