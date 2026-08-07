import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

@Schema({
  collection: 'brokerTokens',
  timestamps: { createdAt: false, updatedAt: 'updatedAt' },
})
export class BrokerTokenDocumentSchema {
  /** A `BrokerAccount.accountId` — already globally unique, already implies both owning user and broker. One stored token per account. */
  @Prop({ required: true, unique: true })
  accountId!: string;

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
