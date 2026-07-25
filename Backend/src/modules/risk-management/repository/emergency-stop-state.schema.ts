import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

@Schema({ collection: 'emergencyStopState' })
export class EmergencyStopStateDocumentSchema {
  @Prop({ required: true, unique: true, default: 'default' })
  singletonId!: string;
  @Prop({ required: true }) active!: boolean;
  @Prop({ type: String, default: null }) reason!: string | null;
  @Prop({ type: String, default: null }) triggeredBy!: string | null;
  @Prop({ type: String, default: null }) triggeredAt!: string | null;
  @Prop({ type: String, default: null }) resetAt!: string | null;
  @Prop({ required: true }) updatedAt!: string;
}

export type EmergencyStopStateDocument =
  HydratedDocument<EmergencyStopStateDocumentSchema>;
export const EmergencyStopStateMongooseSchema = SchemaFactory.createForClass(
  EmergencyStopStateDocumentSchema,
);
