import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, type HydratedDocument } from 'mongoose';
import { ExitReason } from '../models/exit-reason.enum';

/**
 * `brokerMetadata`/`trailingConfig` use Mixed rather than a typed nested
 * schema — the same technique Phase 9's RecoverySnapshotDocumentSchema uses
 * for its own arbitrary nested objects, chosen after Phase 9 discovered
 * Mongoose's `[Object]` array-of-objects casting cannot reliably round-trip
 * objects that themselves contain arrays.
 */
@Schema({ collection: 'tradeExtensions' })
export class TradeExtensionDocumentSchema {
  @Prop({ required: true, unique: true }) tradeId!: string;
  @Prop({ type: String, default: null }) brokerPositionId!: string | null;
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  brokerMetadata!: unknown;
  @Prop({ type: String, enum: ExitReason, default: null })
  exitReason!: ExitReason | null;
  @Prop({ required: true, default: false }) trailingEnabled!: boolean;
  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  trailingConfig!: unknown;
  @Prop({ type: [Number], default: [] }) targetExitQuantities!: number[];
  @Prop({ type: Number, default: null }) lastTrailingStepPrice!: number | null;
  @Prop({ required: true }) createdAt!: string;
  @Prop({ required: true }) updatedAt!: string;
}

export type TradeExtensionDocument =
  HydratedDocument<TradeExtensionDocumentSchema>;
export const TradeExtensionMongooseSchema = SchemaFactory.createForClass(
  TradeExtensionDocumentSchema,
);
