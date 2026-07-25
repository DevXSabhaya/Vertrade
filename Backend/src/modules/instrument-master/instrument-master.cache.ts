import { Injectable } from '@nestjs/common';
import type { Instrument } from './entities/instrument.entity';

export interface InstrumentCacheSnapshot {
  version: number;
  loadedAt: Date;
  instrumentCount: number;
}

/**
 * In-memory, memory-first instrument cache. "Thread-safe" in Node's
 * single-threaded model means: a reader can never observe a half-built cache.
 * That's achieved by building the entire next generation of Maps in local
 * variables first, then reassigning all three references in one synchronous
 * block — an atomic swap with no locks needed. If a refresh fails upstream,
 * swap() is simply never called and the previous generation keeps serving reads.
 */
@Injectable()
export class InstrumentCache {
  private byToken = new Map<string, Instrument>();
  private byTradingSymbol = new Map<string, Instrument>();
  private byUnderlying = new Map<string, Instrument[]>();
  private version = 0;
  private loadedAt: Date | null = null;

  swap(instruments: readonly Instrument[]): InstrumentCacheSnapshot {
    const byToken = new Map<string, Instrument>();
    const byTradingSymbol = new Map<string, Instrument>();
    const byUnderlying = new Map<string, Instrument[]>();

    for (const instrument of instruments) {
      byToken.set(instrument.token, instrument);
      byTradingSymbol.set(instrument.tradingSymbol, instrument);

      const key = instrument.name.toUpperCase();
      const bucket = byUnderlying.get(key);
      if (bucket) {
        bucket.push(instrument);
      } else {
        byUnderlying.set(key, [instrument]);
      }
    }

    this.byToken = byToken;
    this.byTradingSymbol = byTradingSymbol;
    this.byUnderlying = byUnderlying;
    // Wall-clock-based, not a small incrementing counter: `version` is
    // persisted to MongoDB (`InstrumentMasterRepository.saveSnapshot`) and
    // `findLatestSnapshot()` selects `{ version: latestVersion }` across
    // process restarts. A per-process counter starting at 0/1/2 on every
    // boot collides across restarts, causing `findLatestSnapshot()` to
    // return the union of two unrelated process generations' documents
    // under the same version number — this is what produced the ambiguous
    // multi-expiry results discovered during Phase 15 manual verification.
    // `Date.now()` distinguishes process generations (real wall-clock time
    // always advances between separate process runs); `Math.max(., this.version + 1)`
    // additionally guarantees strict monotonicity even when two swaps land
    // in the same millisecond within one process.
    this.version = Math.max(Date.now(), this.version + 1);
    this.loadedAt = new Date();

    return this.getSnapshot();
  }

  findByToken(token: string): Instrument | undefined {
    return this.byToken.get(token);
  }

  findByTradingSymbol(tradingSymbol: string): Instrument | undefined {
    return this.byTradingSymbol.get(tradingSymbol);
  }

  findByUnderlying(name: string): readonly Instrument[] {
    return this.byUnderlying.get(name.toUpperCase()) ?? [];
  }

  /**
   * Permissive, multi-result lookup for an instrument-picker UI — unlike
   * `InstrumentResolverService.resolve()` (used at trade-creation time),
   * this never throws on an ambiguous or partial query; it just ranks and
   * returns whatever matches so the user can pick one. Numeric tokens
   * filter by strike, CE/PE tokens filter by option type, and every
   * remaining token must appear (case-insensitively) in either the
   * underlying name or the trading symbol — so "SENSEX 77200 CE",
   * "SENSEX", and "RELIANCE" all work with the same logic.
   */
  search(query: string, limit = 20): readonly Instrument[] {
    const tokens = query.trim().toUpperCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];

    const isNumeric = (token: string) => /^\d+(\.\d+)?$/.test(token);
    const isOptionType = (token: string) => token === 'CE' || token === 'PE';

    const strikeFilters = tokens.filter(isNumeric).map(Number);
    const optionTypeFilters = tokens.filter(isOptionType);
    const textFilters = tokens.filter(
      (token) => !isNumeric(token) && !isOptionType(token),
    );

    const results: Instrument[] = [];
    for (const instrument of this.byToken.values()) {
      if (textFilters.length > 0) {
        const haystack =
          `${instrument.name} ${instrument.tradingSymbol}`.toUpperCase();
        if (!textFilters.every((token) => haystack.includes(token))) continue;
      }
      if (
        strikeFilters.length > 0 &&
        (instrument.strike === null ||
          !strikeFilters.includes(instrument.strike))
      ) {
        continue;
      }
      if (
        optionTypeFilters.length > 0 &&
        (instrument.optionType === null ||
          !optionTypeFilters.includes(instrument.optionType))
      ) {
        continue;
      }

      results.push(instrument);
      if (results.length >= limit) break;
    }
    return results;
  }

  isLoaded(): boolean {
    return this.version > 0;
  }

  getSnapshot(): InstrumentCacheSnapshot {
    return {
      version: this.version,
      loadedAt: this.loadedAt ?? new Date(0),
      instrumentCount: this.byToken.size,
    };
  }
}
