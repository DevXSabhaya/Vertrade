import { InstrumentCache } from './instrument-master.cache';
import { Instrument } from './entities/instrument.entity';
import { OptionType } from './option-type.enum';

function makeInstrument(
  overrides: Partial<{
    token: string;
    tradingSymbol: string;
    name: string;
    segment: string;
    strike: number | null;
    optionType: OptionType | null;
    expiry: Date | null;
  }> = {},
): Instrument {
  return new Instrument(
    overrides.token ?? 'TOK1',
    'NFO',
    overrides.segment ?? 'OPTIDX',
    overrides.tradingSymbol ?? 'NIFTY24500CE',
    overrides.name ?? 'NIFTY',
    'expiry' in overrides
      ? overrides.expiry!
      : new Date('2026-12-31T23:59:59Z'),
    'strike' in overrides ? overrides.strike! : 24500,
    'optionType' in overrides ? overrides.optionType! : OptionType.CE,
    50,
    0.05,
    2,
  );
}

describe('InstrumentCache', () => {
  it('is not loaded before the first swap', () => {
    const cache = new InstrumentCache();
    expect(cache.isLoaded()).toBe(false);
    expect(cache.getSnapshot().version).toBe(0);
  });

  it('indexes instruments by token, tradingSymbol, and underlying after a swap', () => {
    const cache = new InstrumentCache();
    const instrument = makeInstrument();

    cache.swap([instrument]);

    expect(cache.findByToken('TOK1')).toBe(instrument);
    expect(cache.findByTradingSymbol('NIFTY24500CE')).toBe(instrument);
    expect(cache.findByUnderlying('nifty')).toEqual([instrument]);
    expect(cache.isLoaded()).toBe(true);
  });

  it('monotonically increases the version and updates loadedAt on every swap', () => {
    const cache = new InstrumentCache();
    cache.swap([makeInstrument()]);
    const first = cache.getSnapshot();

    cache.swap([makeInstrument({ token: 'TOK2' })]);
    const second = cache.getSnapshot();

    // Wall-clock-based (not a small incrementing counter) so it stays
    // globally unique across process restarts — see the comment on
    // InstrumentCache.swap(). The invariant that matters is monotonicity,
    // not a fixed +1 step.
    expect(second.version).toBeGreaterThan(first.version);
    expect(second.loadedAt.getTime()).toBeGreaterThanOrEqual(
      first.loadedAt.getTime(),
    );
  });

  it('never produces the same version twice, even across many swaps in the same millisecond (regression: two process generations must never collide on the same persisted version)', () => {
    const cache = new InstrumentCache();
    const versions = new Set<number>();
    for (let i = 0; i < 50; i += 1) {
      const snapshot = cache.swap([makeInstrument({ token: `TOK${i}` })]);
      versions.add(snapshot.version);
    }
    expect(versions.size).toBe(50);
  });

  it('fully replaces the previous generation — stale entries are not carried over', () => {
    const cache = new InstrumentCache();
    cache.swap([makeInstrument({ token: 'OLD' })]);

    cache.swap([makeInstrument({ token: 'NEW' })]);

    expect(cache.findByToken('OLD')).toBeUndefined();
    expect(cache.findByToken('NEW')).toBeDefined();
  });

  it('keeps serving the previous generation if swap is simply never called (simulating a failed refresh)', () => {
    const cache = new InstrumentCache();
    cache.swap([makeInstrument({ token: 'STABLE' })]);
    const snapshotBefore = cache.getSnapshot();

    // A failed refresh means the caller never invokes swap() again.
    const snapshotAfter = cache.getSnapshot();

    expect(cache.findByToken('STABLE')).toBeDefined();
    expect(snapshotAfter).toEqual(snapshotBefore);
  });

  it('groups multiple instruments under the same underlying', () => {
    const cache = new InstrumentCache();
    const a = makeInstrument({ token: 'A', tradingSymbol: 'NIFTY24500CE' });
    const b = makeInstrument({ token: 'B', tradingSymbol: 'NIFTY24600CE' });

    cache.swap([a, b]);

    expect(cache.findByUnderlying('NIFTY')).toHaveLength(2);
  });

  it('returns an empty array for an unknown underlying', () => {
    const cache = new InstrumentCache();
    cache.swap([makeInstrument()]);
    expect(cache.findByUnderlying('UNKNOWN')).toEqual([]);
  });

  describe('search', () => {
    function seededCache(): InstrumentCache {
      const cache = new InstrumentCache();
      cache.swap([
        makeInstrument({
          token: 'SENSEX-77200-CE',
          tradingSymbol: 'SENSEX2512677200CE',
          name: 'SENSEX',
          strike: 77200,
          optionType: OptionType.CE,
        }),
        makeInstrument({
          token: 'SENSEX-77200-PE',
          tradingSymbol: 'SENSEX2512677200PE',
          name: 'SENSEX',
          strike: 77200,
          optionType: OptionType.PE,
        }),
        makeInstrument({
          token: 'SENSEX-77300-CE',
          tradingSymbol: 'SENSEX2512677300CE',
          name: 'SENSEX',
          strike: 77300,
          optionType: OptionType.CE,
        }),
        makeInstrument({
          token: 'NIFTY-25000-CE',
          tradingSymbol: 'NIFTY2512625000CE',
          name: 'NIFTY',
          strike: 25000,
          optionType: OptionType.CE,
        }),
        makeInstrument({
          token: 'RELIANCE-EQ',
          tradingSymbol: 'RELIANCE-EQ',
          name: 'RELIANCE',
          segment: 'EQ',
          strike: null,
          optionType: null,
          expiry: null,
        }),
      ]);
      return cache;
    }

    it('returns an empty array for an empty query', () => {
      expect(seededCache().search('   ')).toEqual([]);
    });

    it('matches on underlying name alone, returning every contract for it', () => {
      const results = seededCache().search('SENSEX');
      expect(results).toHaveLength(3);
      expect(results.every((i) => i.name === 'SENSEX')).toBe(true);
    });

    it('narrows by strike when a numeric token is present', () => {
      const results = seededCache().search('SENSEX 77200');
      expect(results).toHaveLength(2);
      expect(results.every((i) => i.strike === 77200)).toBe(true);
    });

    it('narrows by option type when a CE/PE token is present', () => {
      const results = seededCache().search('SENSEX 77200 CE');
      expect(results).toHaveLength(1);
      expect(results[0]?.tradingSymbol).toBe('SENSEX2512677200CE');
    });

    it('matches an equity by name with no strike/option-type filters', () => {
      const results = seededCache().search('RELIANCE');
      expect(results).toHaveLength(1);
      expect(results[0]?.segment).toBe('EQ');
    });

    it('is case-insensitive', () => {
      expect(seededCache().search('reliance')).toHaveLength(1);
      expect(seededCache().search('sensex ce')).toHaveLength(2);
    });

    it('returns no results for a query matching nothing', () => {
      expect(seededCache().search('DOESNOTEXIST')).toEqual([]);
    });

    it('respects the limit parameter', () => {
      expect(seededCache().search('SENSEX', 2)).toHaveLength(2);
    });
  });
});
