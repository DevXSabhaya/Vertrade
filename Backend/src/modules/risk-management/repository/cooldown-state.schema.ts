import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { CooldownReason } from '../models/cooldown.model';

/** Singleton document — its mere existence means a cooldown is active; `CooldownStateRepository.save(null)` deletes it. */
@Schema({ collection: 'cooldownState' })
export class CooldownStateDocumentSchema {
  @Prop({ required: true, unique: true, default: 'default' })
  singletonId!: string;
  @Prop({ required: true, type: String, enum: CooldownReason })
  reason!: CooldownReason;
  @Prop({ required: true }) startedAt!: string;
  @Prop({ required: true }) expiresAt!: string;
}

export type CooldownStateDocument =
  HydratedDocument<CooldownStateDocumentSchema>;
export const CooldownStateMongooseSchema = SchemaFactory.createForClass(
  CooldownStateDocumentSchema,
);
