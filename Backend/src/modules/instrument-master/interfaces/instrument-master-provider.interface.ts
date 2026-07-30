import type { Instrument } from '../entities/instrument.entity';

/**
 * The Broker Adapter seam: all download + broker-specific parsing logic lives
 * behind this interface. InstrumentMasterService depends only on this — it
 * never knows Dhan (or any future broker) exists.
 */
export interface IInstrumentMasterProvider {
  readonly brokerName: string;
  fetchInstruments(): Promise<Instrument[]>;
}
