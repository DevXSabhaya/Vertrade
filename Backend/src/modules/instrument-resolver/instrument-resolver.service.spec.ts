import { InstrumentResolverService } from './instrument-resolver.service';
import { InstrumentMasterService } from '@modules/instrument-master/instrument-master.service';
import { InstrumentCache } from '@modules/instrument-master/instrument-master.cache';
import { Instrument } from '@modules/instrument-master/entities/instrument.entity';
import { OptionType } from '@modules/instrument-master/option-type.enum';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { InstrumentResolvedEvent } from './events/instrument-resolved.event';
import { InstrumentResolutionFailedEvent } from './events/instrument-resolution-failed.event';
import { UnknownSymbolException } from './exceptions/unknown-symbol.exception';
import { InvalidStrikeException } from './exceptions/invalid-strike.exception';
import { InvalidSegmentException } from './exceptions/invalid-segment.exception';
import { MissingExpiryException } from './exceptions/missing-expiry.exception';
import { ExpiredContractException } from './exceptions/expired-contract.exception';
import { AmbiguousInstrumentException } from './exceptions/ambiguous-instrument.exception';
import { DuplicateInstrumentException } from './exceptions/duplicate-instrument.exception';
import { ExpiryNotAvailableException } from './exceptions/expiry-not-available.exception';

const FUTURE_EXPIRY = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const PAST_EXPIRY = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

function option(
  token: string,
  name: string,
  strike: number,
  optionType: OptionType,
  expiry: Date | null,
  segment = 'OPTIDX',
): Instrument {
  return new Instrument(
    token,
    'NFO',
    segment,
    `${name}${strike}${optionType}`,
    name,
    expiry,
    strike,
    optionType,
    50,
    0.05,
    2,
  );
}

function nonOption(
  token: string,
  name: string,
  segment = 'EQUITY',
): Instrument {
  return new Instrument(
    token,
    'NSE',
    segment,
    `${name}-EQ`,
    name,
    null,
    null,
    null,
    1,
    0.05,
    2,
  );
}

describe('InstrumentResolverService', () => {
  let cache: InstrumentCache;
  let eventBus: jest.Mocked<IEventBus>;
  let resolver: InstrumentResolverService;

  function seed(instruments: Instrument[]): void {
    cache.swap(instruments);
  }

  beforeEach(() => {
    cache = new InstrumentCache();
    eventBus = {
      publish: jest.fn(),
      subscribe: jest.fn(),
      subscribeToAll: jest.fn(),
    };
    const instrumentMasterServiceStub = {
      getCache: () => cache,
    } as unknown as InstrumentMasterService;
    resolver = new InstrumentResolverService(
      instrumentMasterServiceStub,
      eventBus,
    );
  });

  it('resolves a valid call option and publishes InstrumentResolvedEvent', () => {
    seed([option('T1', 'SENSEX', 77200, OptionType.CE, FUTURE_EXPIRY)]);

    const resolved = resolver.resolve('Sensex 77200 CE');

    expect(resolved.instrumentToken).toBe('T1');
    expect(resolved.tradingSymbol).toBe('SENSEX77200CE');
    expect(resolved.strike).toBe(77200);
    expect(resolved.optionType).toBe(OptionType.CE);
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.any(InstrumentResolvedEvent),
    );
  });

  it('resolves BANKNIFTY 56800 PE — a real, non-ATM strike, not just the option-type/underlying happy path SENSEX already covers', () => {
    seed([option('T3', 'BANKNIFTY', 56800, OptionType.PE, FUTURE_EXPIRY)]);

    const resolved = resolver.resolve('BANKNIFTY 56800 PE');

    expect(resolved.instrumentToken).toBe('T3');
    expect(resolved.tradingSymbol).toBe('BANKNIFTY56800PE');
    expect(resolved.strike).toBe(56800);
    expect(resolved.optionType).toBe(OptionType.PE);
  });

  it('resolves BANKNIFTY 56800 CE — same strike as the PE regression case, opposite option type, both must resolve independently', () => {
    seed([
      option('T3-PE', 'BANKNIFTY', 56800, OptionType.PE, FUTURE_EXPIRY),
      option('T3-CE', 'BANKNIFTY', 56800, OptionType.CE, FUTURE_EXPIRY),
    ]);

    const resolved = resolver.resolve('BANKNIFTY 56800 CE');

    expect(resolved.instrumentToken).toBe('T3-CE');
    expect(resolved.tradingSymbol).toBe('BANKNIFTY56800CE');
    expect(resolved.strike).toBe(56800);
    expect(resolved.optionType).toBe(OptionType.CE);
  });

  it('resolves NIFTY 25000 CE and returns the lot size unchanged from the underlying instrument record', () => {
    const contract = option(
      'T-NIFTY',
      'NIFTY',
      25000,
      OptionType.CE,
      FUTURE_EXPIRY,
    );
    seed([contract]);

    const resolved = resolver.resolve('NIFTY 25000 CE');

    expect(resolved.instrumentToken).toBe('T-NIFTY');
    expect(resolved.strike).toBe(25000);
    expect(resolved.optionType).toBe(OptionType.CE);
    // Lot size must pass through byte-for-byte from the Instrument record —
    // never recomputed, guessed, or defaulted by the resolver.
    expect(resolved.lotSize).toBe(contract.lotSize);
  });

  it('resolves a plain non-option underlying like BankNifty', () => {
    seed([nonOption('T2', 'BANKNIFTY')]);
    const resolved = resolver.resolve('BankNifty');
    expect(resolved.instrumentToken).toBe('T2');
  });

  it('throws UnknownSymbolException and publishes InstrumentResolutionFailedEvent for an unrecognized underlying', () => {
    seed([option('T1', 'SENSEX', 77200, OptionType.CE, FUTURE_EXPIRY)]);

    expect(() => resolver.resolve('CrudeOil')).toThrow(UnknownSymbolException);
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.any(InstrumentResolutionFailedEvent),
    );
  });

  it('throws InvalidStrikeException when the strike does not exist for that underlying/option type', () => {
    seed([option('T1', 'SENSEX', 77200, OptionType.CE, FUTURE_EXPIRY)]);
    expect(() => resolver.resolve('Sensex 77300 CE')).toThrow(
      InvalidStrikeException,
    );
  });

  it('throws UnknownSymbolException when the underlying exists but not for that option type', () => {
    seed([option('T1', 'SENSEX', 77200, OptionType.CE, FUTURE_EXPIRY)]);
    expect(() => resolver.resolve('Sensex 77200 PE')).toThrow(
      UnknownSymbolException,
    );
  });

  it('throws ExpiredContractException for a contract past its expiry', () => {
    seed([option('T1', 'SENSEX', 77200, OptionType.CE, PAST_EXPIRY)]);
    expect(() => resolver.resolve('Sensex 77200 CE')).toThrow(
      ExpiredContractException,
    );
  });

  it('throws AmbiguousInstrumentException when multiple expiries match the same strike', () => {
    const laterExpiry = new Date(
      FUTURE_EXPIRY.getTime() + 7 * 24 * 60 * 60 * 1000,
    );
    seed([
      option('T1', 'SENSEX', 77200, OptionType.CE, FUTURE_EXPIRY),
      option('T2', 'SENSEX', 77200, OptionType.CE, laterExpiry),
    ]);

    expect(() => resolver.resolve('Sensex 77200 CE')).toThrow(
      AmbiguousInstrumentException,
    );
  });

  it('resolves the exact contract when an explicit expiry disambiguates multiple candidates — never silently picks one', () => {
    const laterExpiry = new Date(
      FUTURE_EXPIRY.getTime() + 7 * 24 * 60 * 60 * 1000,
    );
    seed([
      option('T1-EARLY', 'BANKNIFTY', 56800, OptionType.PE, FUTURE_EXPIRY),
      option('T1-LATE', 'BANKNIFTY', 56800, OptionType.PE, laterExpiry),
    ]);

    const resolved = resolver.resolve('BANKNIFTY 56800 PE', laterExpiry);

    expect(resolved.instrumentToken).toBe('T1-LATE');
    expect(resolved.expiry?.getTime()).toBe(laterExpiry.getTime());
  });

  it('throws ExpiryNotAvailableException when an explicit expiry matches no candidate', () => {
    seed([option('T1', 'BANKNIFTY', 56800, OptionType.PE, FUTURE_EXPIRY)]);

    const wrongExpiry = new Date(
      FUTURE_EXPIRY.getTime() + 30 * 24 * 60 * 60 * 1000,
    );

    expect(() => resolver.resolve('BANKNIFTY 56800 PE', wrongExpiry)).toThrow(
      ExpiryNotAvailableException,
    );
  });

  describe('resolveExpiries', () => {
    it('lists every live contract across all expiries for the same underlying/strike/optionType, soonest first — never throws on ambiguity', () => {
      const laterExpiry = new Date(
        FUTURE_EXPIRY.getTime() + 7 * 24 * 60 * 60 * 1000,
      );
      const evenLaterExpiry = new Date(
        FUTURE_EXPIRY.getTime() + 21 * 24 * 60 * 60 * 1000,
      );
      seed([
        option('T-LATE', 'BANKNIFTY', 56800, OptionType.PE, laterExpiry),
        option('T-EARLY', 'BANKNIFTY', 56800, OptionType.PE, FUTURE_EXPIRY),
        option(
          'T-EVEN-LATER',
          'BANKNIFTY',
          56800,
          OptionType.PE,
          evenLaterExpiry,
        ),
      ]);

      const results = resolver.resolveExpiries('BANKNIFTY 56800 PE');

      expect(results.map((r) => r.instrumentToken)).toEqual([
        'T-EARLY',
        'T-LATE',
        'T-EVEN-LATER',
      ]);
    });

    it('excludes an expired contract from the list', () => {
      seed([
        option('T-EXPIRED', 'BANKNIFTY', 56800, OptionType.PE, PAST_EXPIRY),
        option('T-LIVE', 'BANKNIFTY', 56800, OptionType.PE, FUTURE_EXPIRY),
      ]);

      const results = resolver.resolveExpiries('BANKNIFTY 56800 PE');

      expect(results.map((r) => r.instrumentToken)).toEqual(['T-LIVE']);
    });

    it('returns a single-element list when only one expiry exists — the same contract resolve() would return', () => {
      seed([option('T1', 'SENSEX', 77200, OptionType.CE, FUTURE_EXPIRY)]);

      const results = resolver.resolveExpiries('SENSEX 77200 CE');

      expect(results).toHaveLength(1);
      expect(results[0]?.instrumentToken).toBe('T1');
    });

    it('still throws InvalidStrikeException for a genuinely invalid strike', () => {
      seed([option('T1', 'SENSEX', 77200, OptionType.CE, FUTURE_EXPIRY)]);
      expect(() => resolver.resolveExpiries('Sensex 77300 CE')).toThrow(
        InvalidStrikeException,
      );
    });
  });

  it('throws DuplicateInstrumentException when two identical contracts share the same expiry', () => {
    seed([
      option('T1', 'SENSEX', 77200, OptionType.CE, FUTURE_EXPIRY),
      option('T2', 'SENSEX', 77200, OptionType.CE, FUTURE_EXPIRY),
    ]);

    expect(() => resolver.resolve('Sensex 77200 CE')).toThrow(
      DuplicateInstrumentException,
    );
  });

  it('throws MissingExpiryException for an option contract with no expiry data', () => {
    seed([option('T1', 'SENSEX', 77200, OptionType.CE, null)]);
    expect(() => resolver.resolve('Sensex 77200 CE')).toThrow(
      MissingExpiryException,
    );
  });

  it('throws InvalidSegmentException for an instrument with an unrecognized segment', () => {
    seed([
      option(
        'T1',
        'SENSEX',
        77200,
        OptionType.CE,
        FUTURE_EXPIRY,
        'NOT_A_REAL_SEGMENT',
      ),
    ]);
    expect(() => resolver.resolve('Sensex 77200 CE')).toThrow(
      InvalidSegmentException,
    );
  });

  it('throws UnknownSymbolException when the underlying exists only as options and a plain lookup is requested', () => {
    seed([option('T1', 'SENSEX', 77200, OptionType.CE, FUTURE_EXPIRY)]);
    expect(() => resolver.resolve('Sensex')).toThrow(UnknownSymbolException);
  });
});
