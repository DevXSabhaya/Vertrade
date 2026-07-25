import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { KillSwitchStatus } from '../models/kill-switch-status.enum';

@Schema({ collection: 'killSwitchState' })
export class KillSwitchStateDocumentSchema {
  @Prop({ required: true, unique: true, default: 'default' })
  singletonId!: string;
  @Prop({ required: true, type: String, enum: KillSwitchStatus })
  status!: KillSwitchStatus;
  @Prop({ type: String, default: null }) reason!: string | null;
  @Prop({ type: String, default: null }) activatedBy!: string | null;
  @Prop({ type: String, default: null }) activatedAt!: string | null;
  @Prop({ type: String, default: null }) deactivatedAt!: string | null;
  @Prop({ required: true }) updatedAt!: string;
}

export type KillSwitchStateDocument =
  HydratedDocument<KillSwitchStateDocumentSchema>;
export const KillSwitchStateMongooseSchema = SchemaFactory.createForClass(
  KillSwitchStateDocumentSchema,
);
