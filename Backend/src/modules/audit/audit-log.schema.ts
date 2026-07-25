import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, type HydratedDocument } from 'mongoose';

@Schema({ collection: 'auditLogs', timestamps: false })
export class AuditLogDocumentSchema {
  @Prop({ required: true })
  eventName!: string;

  @Prop({ required: true })
  timestamp!: string;

  @Prop()
  correlationId?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  payload?: unknown;
}

export type AuditLogDocument = HydratedDocument<AuditLogDocumentSchema>;
export const AuditLogMongooseSchema = SchemaFactory.createForClass(
  AuditLogDocumentSchema,
);
AuditLogMongooseSchema.index({ eventName: 1, timestamp: 1 });
AuditLogMongooseSchema.index({ correlationId: 1 });
