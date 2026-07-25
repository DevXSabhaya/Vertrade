import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

@Schema({ collection: 'repairActions' })
export class RepairActionDocumentSchema {
  @Prop({ required: true, unique: true }) actionId!: string;
  @Prop({ required: true }) tradeId!: string;
  @Prop({ required: true }) reportId!: string;
  @Prop({ required: true }) field!: string;
  @Prop({ required: true }) previousValue!: string;
  @Prop({ required: true }) newValue!: string;
  @Prop({ required: true }) appliedAt!: string;
  @Prop({ required: true }) succeeded!: boolean;
  @Prop({ required: true }) reason!: string;
}

export type RepairActionDocument = HydratedDocument<RepairActionDocumentSchema>;
export const RepairActionMongooseSchema = SchemaFactory.createForClass(
  RepairActionDocumentSchema,
);
RepairActionMongooseSchema.index({ tradeId: 1, appliedAt: -1 });
