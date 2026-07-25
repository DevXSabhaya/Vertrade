import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { UserStatus } from '../models/user-status.enum';

@Schema({ collection: 'users' })
export class UserDocumentSchema {
  @Prop({ required: true, unique: true }) userId!: string;
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;
  @Prop({ required: true }) passwordHash!: string;
  @Prop({ required: true }) displayName!: string;
  @Prop({
    required: true,
    type: String,
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  status!: UserStatus;
  @Prop({ required: true }) createdAt!: string;
  @Prop({ required: true }) updatedAt!: string;
  @Prop({ type: String, default: null }) lastLoginAt!: string | null;
}

export type UserDocument = HydratedDocument<UserDocumentSchema>;
export const UserMongooseSchema =
  SchemaFactory.createForClass(UserDocumentSchema);
