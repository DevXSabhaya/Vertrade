import { Injectable } from '@nestjs/common';
import { Instrument } from '../entities/instrument.entity';
import { OptionType } from '../option-type.enum';
import type { IInstrumentMasterProvider } from '../interfaces/instrument-master-provider.interface';

interface EquitySeed {
  readonly symbol: string;
  readonly name: string;
}

interface IndexSeed {
  readonly underlying: string;
  readonly exchange: string;
  readonly segment: string;
  readonly strikeStep: number;
  readonly strikeCount: number;
  readonly atmStrike: number;
  readonly lotSize: number;
}

const EQUITIES: readonly EquitySeed[] = [
  { symbol: 'RELIANCE', name: 'RELIANCE' },
  { symbol: 'TCS', name: 'TCS' },
  { symbol: 'INFY', name: 'INFY' },
  { symbol: 'HDFCBANK', name: 'HDFCBANK' },
  { symbol: 'ICICIBANK', name: 'ICICIBANK' },
  { symbol: 'SBIN', name: 'SBIN' },
  { symbol: 'TATAMOTORS', name: 'TATAMOTORS' },
  { symbol: 'ITC', name: 'ITC' },
  { symbol: 'WIPRO', name: 'WIPRO' },
  { symbol: 'AXISBANK', name: 'AXISBANK' },
];

// Illustrative strike ranges/lot sizes only, loosely modeled on real Indian
// index derivatives conventions for local Paper-trading testing — never
// sourced from or claiming to match a live exchange feed.
const INDEX_OPTIONS: readonly IndexSeed[] = [
  {
    underlying: 'SENSEX',
    exchange: 'BSE_FNO',
    segment: 'OPTIDX',
    strikeStep: 100,
    strikeCount: 25,
    atmStrike: 77200,
    lotSize: 10,
  },
  {
    underlying: 'NIFTY',
    exchange: 'NSE_FNO',
    segment: 'OPTIDX',
    strikeStep: 50,
    strikeCount: 25,
    atmStrike: 25000,
    lotSize: 25,
  },
  {
    underlying: 'BANKNIFTY',
    exchange: 'NSE_FNO',
    segment: 'OPTIDX',
    strikeStep: 100,
    // Wider than the other index ladders (35 vs 25 strikes either side of
    // ATM): BankNifty's real-world level drifts by thousands of points over
    // a few months, and a monthly-expiry-only mock (see nextMonthlyExpiry())
    // never regenerates until the app restarts — a stale but plausible
    // atmStrike previously left strikes like 56800 permanently unresolvable
    // ("Strike 56800 is not available for 'BANKNIFTY PE'") even though nothing
    // was wrong with the resolver itself. A wider ladder gives more headroom
    // before atmStrike needs to be bumped again.
    strikeCount: 35,
    atmStrike: 56800,
    lotSize: 15,
  },
  {
    underlying: 'CRUDEOIL',
    exchange: 'MCX_COMM',
    segment: 'OPTFUT',
    strikeStep: 100,
    strikeCount: 15,
    atmStrike: 7000,
    lotSize: 100,
  },
];

/** Every strike/expiry combination is unique per underlying+optionType, so the resolver never sees an ambiguous match. */
function nextMonthlyExpiry(): Date {
  const now = new Date();
  const expiry = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 10, 0, 0),
  );
  return expiry;
}

/**
 * Serves a fixed, entirely in-memory instrument set — no broker connection,
 * no credentials, no network call. This is what lets `TRADING_MODE=PAPER`
 * (and `INSTRUMENT_MASTER_PROVIDER=MOCK`, the default) resolve natural
 * trading calls like "SENSEX 77200 CE" locally, since the real
 * `DhanInstrumentMasterProvider` requires a live broker download.
 * Selected purely by `INSTRUMENT_MASTER_PROVIDER` in `instrument-master.module.ts`,
 * mirroring `MarketDataModule`'s existing MOCK-vs-DHAN factory pattern.
 */
@Injectable()
export class MockInstrumentMasterProvider implements IInstrumentMasterProvider {
  readonly brokerName = 'mock';

  // eslint-disable-next-line @typescript-eslint/require-await -- kept async to satisfy IInstrumentMasterProvider; this provider never awaits real I/O
  async fetchInstruments(): Promise<Instrument[]> {
    return [...this.buildEquities(), ...this.buildIndexOptions()];
  }

  private buildEquities(): Instrument[] {
    return EQUITIES.map(
      (equity) =>
        new Instrument(
          `MOCK-EQ-${equity.symbol}`,
          'NSE_EQ',
          'EQUITY',
          equity.symbol,
          equity.name,
          null,
          null,
          null,
          1,
          0.05,
          2,
        ),
    );
  }

  private buildIndexOptions(): Instrument[] {
    const expiry = nextMonthlyExpiry();
    const expiryCode = `${expiry.getUTCFullYear()}${String(expiry.getUTCMonth() + 1).padStart(2, '0')}`;
    const instruments: Instrument[] = [];

    for (const index of INDEX_OPTIONS) {
      const half = Math.floor(index.strikeCount / 2);
      for (let i = -half; i <= half; i += 1) {
        const strike = index.atmStrike + i * index.strikeStep;
        if (strike <= 0) continue;

        for (const optionType of [OptionType.CE, OptionType.PE]) {
          instruments.push(
            new Instrument(
              `MOCK-${index.underlying}-${strike}-${optionType}`,
              index.exchange,
              index.segment,
              `${index.underlying}${expiryCode}${strike}${optionType}`,
              index.underlying,
              expiry,
              strike,
              optionType,
              index.lotSize,
              0.05,
              2,
            ),
          );
        }
      }
    }

    return instruments;
  }
}
