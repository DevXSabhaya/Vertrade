import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Instrument } from './entities/instrument.entity';
import { OptionType } from './option-type.enum';
import type {
  IInstrumentRepository,
  InstrumentMasterSnapshot,
  InstrumentSourceProvider,
} from './interfaces/instrument-repository.interface';
import {
  InstrumentDocumentSchema,
  type InstrumentDocument,
} from './instrument-master.schema';

const BATCH_SIZE = 1000;
/** How many past versions to retain for rollback safety before pruning. */
const VERSIONS_TO_RETAIN = 2;

@Injectable()
export class InstrumentMasterRepository implements IInstrumentRepository {
  constructor(
    @InjectModel(InstrumentDocumentSchema.name)
    private readonly model: Model<InstrumentDocument>,
  ) {}

  async saveSnapshot(
    instruments: Instrument[],
    version: number,
    sourceProvider: InstrumentSourceProvider,
  ): Promise<void> {
    const docs = instruments.map((instrument) => ({
      version,
      token: instrument.token,
      exchange: instrument.exchange,
      segment: instrument.segment,
      tradingSymbol: instrument.tradingSymbol,
      name: instrument.name,
      expiry: instrument.expiry ?? undefined,
      strike: instrument.strike ?? undefined,
      optionType: instrument.optionType ?? undefined,
      lotSize: instrument.lotSize,
      tickSize: instrument.tickSize,
      precision: instrument.precision,
      sourceProvider,
    }));

    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      await this.model.insertMany(docs.slice(i, i + BATCH_SIZE), {
        ordered: false,
      });
    }

    await this.pruneOldVersions();
  }

  async findLatestSnapshot(): Promise<InstrumentMasterSnapshot | null> {
    const versions = await this.model.distinct('version').exec();
    if (versions.length === 0) {
      return null;
    }

    const latestVersion = Math.max(...versions);
    const docs = await this.model
      .find({ version: latestVersion })
      .lean()
      .exec();
    if (docs.length === 0) {
      return null;
    }

    const firstDoc = docs[0] as { sourceProvider?: string } | undefined;
    return {
      version: latestVersion,
      savedAt: new Date(),
      instruments: docs.map((doc) => this.toEntity(doc)),
      sourceProvider: this.toSourceProvider(firstDoc?.sourceProvider),
    };
  }

  private toSourceProvider(
    value: string | undefined,
  ): InstrumentSourceProvider | null {
    return value === 'MOCK' || value === 'DHAN' ? value : null;
  }

  private async pruneOldVersions(): Promise<void> {
    const versions = await this.model.distinct('version').exec();
    const sortedDescending = [...versions].sort((a, b) => b - a);
    const toDelete = sortedDescending.slice(VERSIONS_TO_RETAIN);

    if (toDelete.length > 0) {
      await this.model.deleteMany({ version: { $in: toDelete } }).exec();
    }
  }

  private toEntity(doc: {
    token: string;
    exchange: string;
    segment: string;
    tradingSymbol: string;
    name: string;
    expiry?: Date;
    strike?: number;
    optionType?: string;
    lotSize: number;
    tickSize: number;
    precision: number;
  }): Instrument {
    return new Instrument(
      doc.token,
      doc.exchange,
      doc.segment,
      doc.tradingSymbol,
      doc.name,
      doc.expiry ?? null,
      doc.strike ?? null,
      this.toOptionType(doc.optionType),
      doc.lotSize,
      doc.tickSize,
      doc.precision,
    );
  }

  private toOptionType(value: string | undefined): OptionType | null {
    return value === OptionType.CE || value === OptionType.PE ? value : null;
  }
}
