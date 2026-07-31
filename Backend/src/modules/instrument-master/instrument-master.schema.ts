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

  /**
   * Which provider this version's data came from — MOCK or DHAN. Optional
   * (absent on documents written before this field existed): treated as
   * "unknown/stale" by InstrumentMasterService's boot-time provenance check,
   * which triggers an immediate refresh rather than trusting a
   * possibly-wrong-source cache after a mode switch.
   */
  @Prop()
  sourceProvider?: string;
}

export type InstrumentDocument = HydratedDocument<InstrumentDocumentSchema>;
export const InstrumentMongooseSchema = SchemaFactory.createForClass(
  InstrumentDocumentSchema,
);
InstrumentMongooseSchema.index({ version: 1, token: 1 }, { unique: true });
InstrumentMongooseSchema.index({ version: 1 });
