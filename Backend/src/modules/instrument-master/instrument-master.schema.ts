import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

/** One document per instrument per version — avoids the 16MB single-document limit for large masters. */
@Schema({ collection: 'instruments', timestamps: false })
export class InstrumentDocumentSchema {
  @Prop({ required: true })
  version!: number;

  @Prop({ required: true })
  token!: string;

  @Prop({ required: true })
  exchange!: string;

  @Prop({ required: true })
  segment!: string;

  @Prop({ required: true })
  tradingSymbol!: string;

  @Prop({ required: true })
  name!: string;

  @Prop()
  expiry?: Date;

  @Prop()
  strike?: number;

  @Prop()
  optionType?: string;

  @Prop({ required: true })
  lotSize!: number;

  @Prop({ required: true })
  tickSize!: number;

  @Prop({ required: true })
  precision!: number;
}

export type InstrumentDocument = HydratedDocument<InstrumentDocumentSchema>;
export const InstrumentMongooseSchema = SchemaFactory.createForClass(
  InstrumentDocumentSchema,
);
InstrumentMongooseSchema.index({ version: 1, token: 1 }, { unique: true });
InstrumentMongooseSchema.index({ version: 1 });
