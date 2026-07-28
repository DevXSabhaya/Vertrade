import type { InstrumentMasterService } from '@modules/instrument-master/instrument-master.service';
import { Instrument } from '@modules/instrument-master/entities/instrument.entity';
import { OptionType } from '@modules/instrument-master/option-type.enum';
import type { MarketDataService } from '@modules/market-data/market-data.service';
import { Tick } from '@modules/market-data/models/tick.model';
import type { InstrumentResolverService } from './instrument-resolver.service';
import { ResolvedInstrument } from './resolved-instrument.vo';
import { InstrumentResolverController } from './instrument-resolver.controller';

function buildController(options: {
  resolverService?: Partial<
    Pick<InstrumentResolverService, 'resolve' | 'resolveExpiries'>
  >;
  instrumentMasterService?: Partial<Pick<InstrumentMasterService, 'search'>>;
  marketDataService?: Partial<Pick<MarketDataService, 'getLastTick'>>;
}): InstrumentResolverController {
  const resolverService = {
    resolve: jest.fn(),
    resolveExpiries: jest.fn().mockReturnValue([]),
    ...options.resolverService,
  } as unknown as InstrumentResolverService;
  const instrumentMasterService = {
    search: jest.fn().mockReturnValue([]),
    ...options.instrumentMasterService,
  } as unknown as InstrumentMasterService;
  const marketDataService = {
    getLastTick: jest.fn().mockReturnValue(null),
    ...options.marketDataService,
  } as unknown as MarketDataService;

  return new InstrumentResolverController(
    resolverService,
    instrumentMasterService,
    marketDataService,
  );
}

function buildResolvedInstrument(
  overrides: Partial<{
    token: string;
    expiry: Date | null;
    strike: number;
    optionType: OptionType;
  }> = {},
): ResolvedInstrument {
  return new ResolvedInstrument(
    'NFO',
    'OPTIDX',
    'BANKNIFTY202601156800CE',
    overrides.token ?? 'MOCK-BANKNIFTY-56800-CE',
    overrides.expiry === undefined
      ? new Date('2026-01-29T10:00:00.000Z')
      : overrides.expiry,
    overrides.strike ?? 56800,
    overrides.optionType ?? OptionType.CE,
    0.05,
    15,
    2,
    'BANKNIFTY',
  );
}

describe('InstrumentResolverController', () => {
  describe('resolve', () => {
    it('maps every field from ResolvedInstrument straight through — in particular lotSize and tickSize are never swapped or dropped', () => {
      const resolved = buildResolvedInstrument();
      const controller = buildController({
        resolverService: { resolve: jest.fn().mockReturnValue(resolved) },
      });

      const body = controller.resolve({ query: 'BANKNIFTY 56800 CE' });

      expect(body).toEqual({
        underlying: 'BANKNIFTY',
        exchange: 'NFO',
        segment: 'OPTIDX',
        tradingSymbol: 'BANKNIFTY202601156800CE',
        instrumentToken: 'MOCK-BANKNIFTY-56800-CE',
        expiry: '2026-01-29T10:00:00.000Z',
        strike: 56800,
        optionType: OptionType.CE,
        tickSize: 0.05,
        lotSize: 15,
        precision: 2,
      });
    });

    it('passes an explicit expiry query param through to the service as a Date, disambiguating multiple candidates', () => {
      const resolve = jest.fn().mockReturnValue(buildResolvedInstrument());
      const controller = buildController({ resolverService: { resolve } });

      controller.resolve({
        query: 'BANKNIFTY 56800 CE',
        expiry: '2026-01-29',
      });

      expect(resolve).toHaveBeenCalledWith(
        'BANKNIFTY 56800 CE',
        new Date('2026-01-29'),
      );
    });

    it('passes undefined for expiry when none was supplied — never fabricates a default', () => {
      const resolve = jest.fn().mockReturnValue(buildResolvedInstrument());
      const controller = buildController({ resolverService: { resolve } });

      controller.resolve({ query: 'BANKNIFTY 56800 CE' });

      expect(resolve).toHaveBeenCalledWith('BANKNIFTY 56800 CE', undefined);
    });
  });

  describe('expiries', () => {
    it('never throws on ambiguity and returns every candidate with its current price attached', () => {
      const earlier = buildResolvedInstrument({
        token: 'T-EARLY',
        expiry: new Date('2026-07-30T10:00:00.000Z'),
      });
      const later = buildResolvedInstrument({
        token: 'T-LATE',
        expiry: new Date('2026-08-06T10:00:00.000Z'),
      });
      const tick = new Tick(
        'T-EARLY',
        'BANKNIFTY202607306800CE',
        'NFO',
        176.5,
        176.4,
        176.6,
        100,
        50,
        new Date('2026-01-01T09:15:00.000Z'),
        1,
      );
      const controller = buildController({
        resolverService: {
          resolveExpiries: jest.fn().mockReturnValue([earlier, later]),
        },
        marketDataService: {
          getLastTick: jest.fn((token: string) =>
            token === 'T-EARLY' ? tick : null,
          ),
        },
      });

      const results = controller.expiries({ query: 'BANKNIFTY 56800 CE' });

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual(
        expect.objectContaining({
          instrumentToken: 'T-EARLY',
          currentPrice: 176.5,
          lastUpdated: '2026-01-01T09:15:00.000Z',
        }),
      );
      expect(results[1]).toEqual(
        expect.objectContaining({
          instrumentToken: 'T-LATE',
          currentPrice: null,
          lastUpdated: null,
        }),
      );
    });
  });

  describe('search', () => {
    it('maps lotSize/tickSize straight through from the underlying Instrument for every search result', () => {
      const contract = new Instrument(
        'MOCK-BANKNIFTY-56800-PE',
        'NFO',
        'OPTIDX',
        'BANKNIFTY202601156800PE',
        'BANKNIFTY',
        new Date('2026-01-29T10:00:00.000Z'),
        56800,
        OptionType.PE,
        15,
        0.05,
        2,
      );
      const controller = buildController({
        instrumentMasterService: {
          search: jest.fn().mockReturnValue([contract]),
        },
      });

      const [result] = controller.search({ q: 'BANKNIFTY 56800' });

      expect(result).toEqual({
        displayName: 'BANKNIFTY 56800 PE',
        symbol: 'BANKNIFTY202601156800PE',
        exchange: 'NFO',
        token: 'MOCK-BANKNIFTY-56800-PE',
        instrumentType: 'OPTION',
        expiry: '2026-01-29T10:00:00.000Z',
        strike: 56800,
        optionType: OptionType.PE,
        lotSize: 15,
        tickSize: 0.05,
      });
    });
  });
});
