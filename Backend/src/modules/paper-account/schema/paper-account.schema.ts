import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { PaperAccountStatus } from '../models/paper-account-status.enum';

@Schema({ collection: 'paperAccounts' })
export class PaperAccountDocumentSchema {
  @Prop({ required: true, unique: true }) userId!: string;
  @Prop({ required: true }) initialBalance!: number;
  @Prop({ required: true }) availableBalance!: number;
  @Prop({ required: true, default: 0 }) reservedMargin!: number;
  @Prop({ required: true, default: 0 }) realizedPnl!: number;
  @Prop({
    required: true,
    type: String,
    enum: PaperAccountStatus,
    default: PaperAccountStatus.ACTIVE,
  })
  status!: PaperAccountStatus;
  @Prop({ required: true }) createdAt!: string;
  @Prop({ required: true }) updatedAt!: string;
}

export type PaperAccountDocument = HydratedDocument<PaperAccountDocumentSchema>;
export const PaperAccountMongooseSchema = SchemaFactory.createForClass(
  PaperAccountDocumentSchema,
);
