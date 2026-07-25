import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { HealthStatus } from '../models/health-status.enum';

@Schema({ collection: 'healthSnapshots' })
export class HealthSnapshotDocumentSchema {
  @Prop({ required: true })
  timestamp!: string;

  @Prop({ required: true, type: String, enum: HealthStatus })
  overallStatus!: HealthStatus;

  @Prop({ required: true, type: String, enum: HealthStatus })
  brokerStatus!: HealthStatus;

  @Prop({ required: true, type: String, enum: HealthStatus })
  restApiStatus!: HealthStatus;

  @Prop({ required: true, type: String, enum: HealthStatus })
  websocketStatus!: HealthStatus;

  @Prop({ required: true, type: String, enum: HealthStatus })
  marketDataStatus!: HealthStatus;

  @Prop({ required: true, type: String, enum: HealthStatus })
  authStatus!: HealthStatus;

  @Prop({ required: true, type: String, enum: HealthStatus })
  schedulerStatus!: HealthStatus;

  @Prop({ required: true, type: String, enum: HealthStatus })
  databaseStatus!: HealthStatus;

  @Prop({ required: true, type: String, enum: HealthStatus })
  queueStatus!: HealthStatus;

  @Prop({ type: Number, default: null })
  latency!: number | null;

  @Prop({ type: Number, default: null })
  heartbeatAge!: number | null;

  @Prop({ type: String, default: null })
  lastSuccessfulRequest!: string | null;

  @Prop({ required: true, default: 0 })
  activeSubscriptions!: number;

  @Prop({ type: String, default: null })
  connectedSince!: string | null;
}

export type HealthSnapshotDocument =
  HydratedDocument<HealthSnapshotDocumentSchema>;
export const HealthSnapshotMongooseSchema = SchemaFactory.createForClass(
  HealthSnapshotDocumentSchema,
);
