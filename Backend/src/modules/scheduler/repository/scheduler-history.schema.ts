import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { JobName } from '../models/job-name.enum';

@Schema({ collection: 'schedulerHistory' })
export class SchedulerHistoryDocumentSchema {
  @Prop({ required: true, type: String, enum: JobName })
  jobName!: JobName;

  @Prop({ required: true })
  succeeded!: boolean;

  @Prop({ required: true })
  startedAt!: string;

  @Prop({ required: true })
  finishedAt!: string;

  @Prop({ required: true })
  durationMs!: number;

  @Prop({ type: String, default: null })
  error!: string | null;
}

export type SchedulerHistoryDocument =
  HydratedDocument<SchedulerHistoryDocumentSchema>;
export const SchedulerHistoryMongooseSchema = SchemaFactory.createForClass(
  SchedulerHistoryDocumentSchema,
);
