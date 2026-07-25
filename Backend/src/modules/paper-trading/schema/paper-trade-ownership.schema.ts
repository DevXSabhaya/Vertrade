import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import type { TrailingConfiguration } from '@modules/trade-lifecycle/models/trailing-configuration.model';
import { PaperTradeStatus } from '../models/paper-trade-status.enum';

@Schema({ collection: 'paperTradeOwnerships' })
export class PaperTradeOwnershipDocumentSchema {
  @Prop({ required: true, unique: true }) tradeOwnershipId!: string;
  @Prop({ required: true }) userId!: string;
  @Prop({ required: true, unique: true }) idempotencyKey!: string;
  @Prop({ required: true, unique: true }) queueItemId!: string;
  @Prop({ type: String, default: null }) tradeId!: string | null;
  @Prop({
    required: true,
    type: String,
    enum: PaperTradeStatus,
    default: PaperTradeStatus.PENDING,
  })
  status!: PaperTradeStatus;
  @Prop({ required: true }) reservedAmount!: number;
  @Prop({ required: true }) rawSymbol!: string;
  @Prop({ required: true, type: String, enum: TradeDirection })
  direction!: TradeDirection;
  @Prop({ required: true }) quantity!: number;
  @Prop({ required: true }) entryTriggerPrice!: number;
  @Prop({ required: true }) initialStopLoss!: number;
  @Prop({ required: true, default: false }) isMarketOrder!: boolean;
  /**
   * Set at creation time but only ever activated once the underlying
   * Trading Engine trade exists — see `PaperTradeEventListener.onOrderSubmitted`,
   * which applies it via the existing `TradeExtensionStore.patch()` (the
   * same primitive `TrailingManager`/`TargetManager` already use), rather
   * than duplicating trailing logic here.
   */
  @Prop({ type: Object, default: null })
  trailingConfig!: TrailingConfiguration | null;
  @Prop({ type: String, default: null }) failureReason!: string | null;
  @Prop({ required: true }) createdAt!: string;
  @Prop({ required: true }) updatedAt!: string;
}

export type PaperTradeOwnershipDocument =
  HydratedDocument<PaperTradeOwnershipDocumentSchema>;
export const PaperTradeOwnershipMongooseSchema = SchemaFactory.createForClass(
  PaperTradeOwnershipDocumentSchema,
);
PaperTradeOwnershipMongooseSchema.index({ userId: 1, createdAt: -1 });
PaperTradeOwnershipMongooseSchema.index({ tradeId: 1 });
