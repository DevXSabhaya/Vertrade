import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

@Schema({ collection: 'dailyRiskState' })
export class DailyRiskStateDocumentSchema {
  @Prop({ required: true, unique: true }) tradeDate!: string;
  @Prop({ required: true, default: 0 }) realizedPnl!: number;
  @Prop({ required: true, default: 0 }) tradeCount!: number;
  @Prop({ required: true, default: 0 }) consecutiveLosses!: number;
  @Prop({ type: Boolean, default: null }) lastTradeWasLoss!: boolean | null;
  @Prop({ required: true }) updatedAt!: string;
}

export type DailyRiskStateDocument =
  HydratedDocument<DailyRiskStateDocumentSchema>;
export const DailyRiskStateMongooseSchema = SchemaFactory.createForClass(
  DailyRiskStateDocumentSchema,
);
