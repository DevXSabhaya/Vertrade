import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, type HydratedDocument } from 'mongoose';
import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import { TradeState } from '@modules/trading-engine/domain/trade-state.enum';
import { TradeLifecycleStage } from '../models/trade-lifecycle-stage.enum';
import { ExitReason } from '../models/exit-reason.enum';

@Schema({ collection: 'tradeHistory' })
export class TradeHistoryDocumentSchema {
  @Prop({ required: true, unique: true }) tradeId!: string;
  @Prop({ type: String, default: null }) signalId!: string | null;
  @Prop({ type: String, default: null }) brokerOrderId!: string | null;
  @Prop({ type: String, default: null }) brokerPositionId!: string | null;
  @Prop({ required: true }) instrument!: string;
  @Prop({ required: true }) exchange!: string;
  @Prop({ required: true }) token!: string;
  @Prop({ required: true, type: String, enum: TradeDirection })
  direction!: TradeDirection;
  @Prop({ required: true }) entryPrice!: number;
  @Prop({ required: true }) quantity!: number;
  @Prop({ required: true }) filledQuantity!: number;
  @Prop({ required: true }) openQuantity!: number;
  @Prop({ required: true }) exitedQuantity!: number;
  @Prop({ type: Number, default: null }) averagePrice!: number | null;
  @Prop({ type: Number, default: null }) exitPrice!: number | null;
  @Prop({ required: true, type: String, enum: TradeState }) status!: TradeState;
  @Prop({ required: true, type: String, enum: TradeLifecycleStage })
  lifecycleStage!: TradeLifecycleStage;
  @Prop({ required: true }) createdAt!: string;
  @Prop({ required: true }) updatedAt!: string;
  @Prop({ type: MongooseSchema.Types.Mixed, default: [] }) targets!: unknown;
  @Prop({ type: Number, default: null }) currentTarget!: number | null;
  @Prop({ required: true }) stopLoss!: number;
  @Prop({ required: true }) currentStopLoss!: number;
  @Prop({ required: true, default: false }) trailingEnabled!: boolean;
  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  trailingConfiguration!: unknown;
  @Prop({ type: Number, default: null }) riskReward!: number | null;
  @Prop({ type: Number, default: null }) realizedPnl!: number | null;
  @Prop({ type: Number, default: null }) unrealizedPnl!: number | null;
  @Prop({ type: String, enum: ExitReason, default: null })
  exitReason!: ExitReason | null;
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  brokerMetadata!: unknown;
  @Prop({ required: true }) positionDurationMs!: number;
  @Prop({
    required: true,
    type: String,
    enum: ['PAPER', 'LIVE'],
    default: 'PAPER',
  })
  mode!: 'PAPER' | 'LIVE';
}

export type TradeHistoryDocument = HydratedDocument<TradeHistoryDocumentSchema>;
export const TradeHistoryMongooseSchema = SchemaFactory.createForClass(
  TradeHistoryDocumentSchema,
);
TradeHistoryMongooseSchema.index({ createdAt: -1 });
