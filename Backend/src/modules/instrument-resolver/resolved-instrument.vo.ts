import type { OptionType } from '@modules/instrument-master/option-type.enum';

/**
 * What the Trading Engine (and every future consumer) actually receives —
 * never a raw string. Everything needed to place and size an order is here.
 */
export class ResolvedInstrument {
  constructor(
    public readonly exchange: string,
    public readonly segment: string,
    public readonly tradingSymbol: string,
    public readonly instrumentToken: string,
    public readonly expiry: Date | null,
    public readonly strike: number | null,
    public readonly optionType: OptionType | null,
    public readonly tickSize: number,
    public readonly lotSize: number,
    public readonly precision: number,
  ) {}
}
