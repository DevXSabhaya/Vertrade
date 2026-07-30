import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

@Schema({
  collection: 'brokerTokens',
  timestamps: { createdAt: false, updatedAt: 'updatedAt' },
})
export class BrokerTokenDocumentSchema {
  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true })
  broker!: string;

  /** AES-256-GCM ciphertext of the JSON-serialized {clientCode, accessToken, issuedAt}. */
  @Prop({ required: true })
  encryptedPayload!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  updatedAt!: Date;
}

export type BrokerTokenDocument = HydratedDocument<BrokerTokenDocumentSchema>;
export const BrokerTokenMongooseSchema = SchemaFactory.createForClass(
  BrokerTokenDocumentSchema,
);
BrokerTokenMongooseSchema.index({ userId: 1, broker: 1 }, { unique: true });
