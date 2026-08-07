import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { QueueItemState } from '../models/queue-item-state.enum';
import { QueueItemType } from '../models/queue-item-type.enum';
import type { QueueItemHistoryEntry } from '../models/queue-item-snapshot';

@Schema({ collection: 'orderQueueItems' })
export class QueueItemDocumentSchema {
  @Prop({ required: true, unique: true })
  itemId!: string;

  /** The user who submitted this trade — resolved into the trade's `mode`/`brokerAccountId` at actual execution time. See `QueueItem`'s own docstring for why this is stored rather than resolved once at submission. */
  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true, unique: true })
  idempotencyKey!: string;

  @Prop({ required: true, type: String, enum: QueueItemType })
  orderType!: QueueItemType;

  @Prop({ required: true, type: String, enum: QueueItemState })
  state!: QueueItemState;

  @Prop({ required: true, type: Object })
  request!: Record<string, unknown>;

  @Prop({ required: true, type: Object })
  resolvedInstrument!: Record<string, unknown>;

  @Prop({ required: true, default: 0 })
  attempts!: number;

  @Prop({ type: String, default: null })
  lockOwner!: string | null;

  @Prop({ type: Date, default: null })
  lockedAt!: Date | null;

  @Prop({ type: String, default: null })
  lastError!: string | null;

  @Prop({ type: String, default: null })
  resultTradeId!: string | null;

  @Prop({ type: [Object], default: [] })
  history!: QueueItemHistoryEntry[];

  @Prop({ required: true })
  createdAt!: string;

  @Prop({ required: true })
  updatedAt!: string;
}

export type QueueItemDocument = HydratedDocument<QueueItemDocumentSchema>;
export const QueueItemMongooseSchema = SchemaFactory.createForClass(
  QueueItemDocumentSchema,
);
