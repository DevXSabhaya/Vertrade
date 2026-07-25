import type { OptionType } from '../option-type.enum';

/**
 * Broker-agnostic, normalized instrument shape. Nothing outside the broker
 * adapter (e.g. AngelOneInstrumentMasterProvider) ever sees a raw broker record.
 */
export class Instrument {
  constructor(
    public readonly token: string,
    public readonly exchange: string,
    public readonly segment: string,
    public readonly tradingSymbol: string,
    public readonly name: string,
    public readonly expiry: Date | null,
    public readonly strike: number | null,
    public readonly optionType: OptionType | null,
    public readonly lotSize: number,
    public readonly tickSize: number,
    public readonly precision: number,
  ) {}
}
