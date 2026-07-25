import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

/**
 * One row per `forgot-password` request attempt, keyed only by the
 * (normalized) email the caller supplied — recorded unconditionally, even
 * when no account exists for that email. Rate-limiting reads from this
 * collection rather than `PasswordResetTokenDocumentSchema` specifically so
 * the 429 behavior never differs based on whether the account exists, which
 * would otherwise be a user-enumeration side channel.
 */
@Schema({ collection: 'passwordResetRequests' })
export class PasswordResetRequestDocumentSchema {
  @Prop({ required: true, lowercase: true, trim: true }) email!: string;
  @Prop({ required: true }) requestedAt!: string;
}

export type PasswordResetRequestDocument =
  HydratedDocument<PasswordResetRequestDocumentSchema>;
export const PasswordResetRequestMongooseSchema = SchemaFactory.createForClass(
  PasswordResetRequestDocumentSchema,
);
