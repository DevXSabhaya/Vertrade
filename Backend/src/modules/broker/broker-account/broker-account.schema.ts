import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

@Schema({ collection: 'brokerAccounts', timestamps: true })
export class BrokerAccountDocumentSchema {
  @Prop({ required: true, unique: true })
  accountId!: string;

  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true })
  brokerId!: string;

  @Prop({ required: true })
  displayName!: string;

  /** AES-256-GCM ciphertext of the JSON-serialized BrokerAccountCredentials — same scheme as brokerTokens.encryptedPayload. */
  @Prop({ required: true })
  encryptedCredentials!: string;

  @Prop({ required: true, default: false })
  isActive!: boolean;

  @Prop({ type: Date, default: null })
  lastConnectedAt!: Date | null;

  @Prop({ type: String, default: null })
  lastError!: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type BrokerAccountDocument =
  HydratedDocument<BrokerAccountDocumentSchema>;
export const BrokerAccountMongooseSchema = SchemaFactory.createForClass(
  BrokerAccountDocumentSchema,
);
BrokerAccountMongooseSchema.index({ userId: 1, createdAt: -1 });
