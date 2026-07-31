import type { Instrument } from '../entities/instrument.entity';

export type InstrumentSourceProvider = 'MOCK' | 'DHAN';

export interface InstrumentMasterSnapshot {
  version: number;
  instruments: Instrument[];
  savedAt: Date;
  /** null for a snapshot persisted before this field existed — treated as unknown/stale. */
  sourceProvider: InstrumentSourceProvider | null;
}

/**
 * MongoDB backup only — InstrumentMasterService never queries this during
 * normal resolution, only at startup (restore) and after a successful refresh
 * (backup write). The in-memory InstrumentCache is the only thing resolution reads.
 */
export interface IInstrumentRepository {
  saveSnapshot(
    instruments: Instrument[],
    version: number,
    sourceProvider: InstrumentSourceProvider,
  ): Promise<void>;
  findLatestSnapshot(): Promise<InstrumentMasterSnapshot | null>;
}
