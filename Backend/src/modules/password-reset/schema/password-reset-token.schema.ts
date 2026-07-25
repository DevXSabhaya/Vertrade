import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

/**
 * Stores only a SHA-256 hash of the reset code, never the code itself — the
 * same "never store the secret in plaintext" principle as `UserDocumentSchema`
 * storing a bcrypt hash rather than a password.
 */
@Schema({ collection: 'passwordResetTokens' })
export class PasswordResetTokenDocumentSchema {
  @Prop({ required: true }) userId!: string;
  @Prop({ required: true, lowercase: true, trim: true }) email!: string;
  @Prop({ required: true }) codeHash!: string;
  @Prop({ required: true }) expiresAt!: string;
  @Prop({ type: String, default: null }) usedAt!: string | null;
  @Prop({ required: true, default: 0 }) attempts!: number;
  @Prop({ required: true }) createdAt!: string;
  /** Set once the OTP has been verified — a code can only ever be verified once, separately from being spent on an actual password change. */
  @Prop({ type: String, default: null }) verifiedAt!: string | null;
  /** SHA-256 hash of the short-lived reset-session token issued after successful verification — never the raw token, same principle as `codeHash`. */
  @Prop({ type: String, default: null }) sessionTokenHash!: string | null;
  @Prop({ type: String, default: null }) sessionExpiresAt!: string | null;
}

export type PasswordResetTokenDocument =
  HydratedDocument<PasswordResetTokenDocumentSchema>;
export const PasswordResetTokenMongooseSchema = SchemaFactory.createForClass(
  PasswordResetTokenDocumentSchema,
);
