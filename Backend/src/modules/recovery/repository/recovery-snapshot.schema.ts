import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, type HydratedDocument } from 'mongoose';

/**
 * Every nested collection field uses Mixed rather than `type: [Object]`.
 * TradeSnapshot/QueueItemSnapshot entries carry their own nested arrays
 * (targets, remainingTargets, history) — Mongoose's per-element casting for
 * `[Object]` array schemas cannot reliably handle objects that themselves
 * contain arrays and throws at runtime ("MongooseArray is not a function").
 * Mixed stores the array as an opaque blob and skips that casting entirely,
 * the same technique SettingsSchema already uses for its own arbitrary
 * `value: unknown` field.
 */
@Schema({ collection: 'recoverySnapshots' })
export class RecoverySnapshotDocumentSchema {
  @Prop({ required: true, unique: true }) snapshotId!: string;
  @Prop({ required: true }) capturedAt!: string;
  @Prop({ type: MongooseSchema.Types.Mixed, default: [] })
  trades!: unknown;
  @Prop({ type: MongooseSchema.Types.Mixed, default: [] })
  queueItems!: unknown;
  @Prop({ required: true, type: [String], default: [] })
  idempotencyKeys!: string[];
  @Prop({ type: MongooseSchema.Types.Mixed, default: [] })
  marketSubscriptions!: unknown;
  @Prop({ required: true, type: Object, default: {} })
  engineStateSummary!: Record<string, number>;
  @Prop({ type: MongooseSchema.Types.Mixed, default: [] })
  activeBrokerSessions!: unknown;
  @Prop({ type: Object, default: null }) lastTick!: Record<
    string,
    unknown
  > | null;
}

export type RecoverySnapshotDocument =
  HydratedDocument<RecoverySnapshotDocumentSchema>;
export const RecoverySnapshotMongooseSchema = SchemaFactory.createForClass(
  RecoverySnapshotDocumentSchema,
);
RecoverySnapshotMongooseSchema.index({ capturedAt: -1 });
