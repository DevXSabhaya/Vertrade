import { Inject, Injectable } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { InstrumentMasterService } from '@modules/instrument-master/instrument-master.service';
import type { Instrument } from '@modules/instrument-master/entities/instrument.entity';
import { KNOWN_SEGMENTS } from '@modules/instrument-master/known-segments.constant';
import { ResolvedInstrument } from './resolved-instrument.vo';
import { parseSymbolInput } from './parser/symbol-parser';
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

/** Same calendar date, ignoring time-of-day — the frontend only ever has a date to offer, never an exact millisecond expiry timestamp. */
function isSameCalendarDate(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

@Injectable()
export class InstrumentResolverService {
  constructor(
    private readonly instrumentMasterService: InstrumentMasterService,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  /**
   * Resolves to exactly one contract, or throws. When the underlying/strike/
   * optionType has more than one live expiry, `expiryFilter` is required to
   * disambiguate — never silently picks the nearest/soonest one. Callers
   * facing that ambiguity should call `resolveExpiries()` first to list the
   * valid choices, then call this again with the user's selected expiry.
   */
  resolve(rawSymbol: string, expiryFilter?: Date): ResolvedInstrument {
    try {
      const resolved = this.doResolve(rawSymbol, expiryFilter);
      this.eventBus.publish(
        new InstrumentResolvedEvent(rawSymbol, resolved.tradingSymbol),
      );
      return resolved;
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Unknown resolution failure';
      this.eventBus.publish(
        new InstrumentResolutionFailedEvent(rawSymbol, reason),
      );
      throw error;
    }
  }

  /**
   * Lists every currently-tradable contract matching the parsed underlying/
   * strike/optionType, across every expiry — the multi-expiry counterpart to
   * `resolve()`. Never throws on ambiguity (that's the whole point); still
   * throws for a genuinely invalid strike/underlying/option-type, and still
   * excludes expired or unrecognized-segment contracts, exactly like
   * `resolve()` does for its single result. Sorted soonest-expiry first.
   */
  resolveExpiries(rawSymbol: string): ResolvedInstrument[] {
    const parsed = parseSymbolInput(rawSymbol);
    const matches = this.findMatches(rawSymbol, parsed);

    return matches
      .filter(
        (instrument) =>
          KNOWN_SEGMENTS.has(instrument.segment) &&
          (!instrument.expiry || instrument.expiry.getTime() >= Date.now()),
      )
      .slice()
      .sort((a, b) => (a.expiry?.getTime() ?? 0) - (b.expiry?.getTime() ?? 0))
      .map((instrument) => this.toResolvedInstrument(instrument));
  }

  private doResolve(
    rawSymbol: string,
    expiryFilter?: Date,
  ): ResolvedInstrument {
    const parsed = parseSymbolInput(rawSymbol);
    let matches = this.findMatches(rawSymbol, parsed);

    if (expiryFilter) {
      const atExpiry = matches.filter(
        (i) => i.expiry && isSameCalendarDate(i.expiry, expiryFilter),
      );
      if (atExpiry.length === 0) {
        throw new ExpiryNotAvailableException(
          `No contract for "${rawSymbol}" expiring on ${expiryFilter.toISOString().slice(0, 10)}`,
        );
      }
      matches = atExpiry;
    }

    if (matches.length > 1) {
      const distinctExpiries = new Set(
        matches.map((i) => i.expiry?.getTime() ?? null),
      );
      if (distinctExpiries.size > 1) {
        throw new AmbiguousInstrumentException(
          `Multiple contracts match "${rawSymbol}" across ${distinctExpiries.size} expiries — please specify an expiry`,
        );
      }
      throw new DuplicateInstrumentException(
        `Multiple identical contracts found for "${rawSymbol}" in the instrument master`,
      );
    }

    const instrument = matches[0];
    if (!instrument) {
      throw new UnknownSymbolException(`No contract found for "${rawSymbol}"`);
    }

    if (parsed.optionType && !instrument.expiry) {
      throw new MissingExpiryException(
        `Contract for "${rawSymbol}" has no expiry information`,
      );
    }

    if (instrument.expiry && instrument.expiry.getTime() < Date.now()) {
      throw new ExpiredContractException(
        `Contract for "${rawSymbol}" expired on ${instrument.expiry.toISOString()}`,
      );
    }

    if (!KNOWN_SEGMENTS.has(instrument.segment)) {
      throw new InvalidSegmentException(
        `Unrecognized segment "${instrument.segment}" for "${rawSymbol}"`,
      );
    }

    return this.toResolvedInstrument(instrument);
  }

  /** Underlying/strike/optionType matching only — never filters by expiry; shared by `doResolve()` and `resolveExpiries()`. */
  private findMatches(
    rawSymbol: string,
    parsed: ReturnType<typeof parseSymbolInput>,
  ): Instrument[] {
    const candidates = this.instrumentMasterService
      .getCache()
      .findByUnderlying(parsed.underlying);
    if (candidates.length === 0) {
      throw new UnknownSymbolException(
        `No instrument found for underlying "${parsed.underlying}"`,
      );
    }

    if (parsed.optionType) {
      if (parsed.strike === null || parsed.strike <= 0) {
        throw new InvalidStrikeException(`Invalid strike for "${rawSymbol}"`);
      }

      const optionCandidates = candidates.filter(
        (i) => i.optionType === parsed.optionType,
      );
      if (optionCandidates.length === 0) {
        throw new UnknownSymbolException(
          `No ${parsed.optionType} contracts found for "${parsed.underlying}"`,
        );
      }

      const matches = optionCandidates.filter(
        (i) => i.strike === parsed.strike,
      );
      if (matches.length === 0) {
        throw new InvalidStrikeException(
          `Strike ${parsed.strike} is not available for "${parsed.underlying} ${parsed.optionType}"`,
        );
      }
      return matches;
    }

    const matches = candidates.filter((i) => i.optionType === null);
    if (matches.length === 0) {
      throw new UnknownSymbolException(
        `No non-option instrument found for "${parsed.underlying}"`,
      );
    }
    return matches;
  }

  private toResolvedInstrument(instrument: Instrument): ResolvedInstrument {
    return new ResolvedInstrument(
      instrument.exchange,
      instrument.segment,
      instrument.tradingSymbol,
      instrument.token,
      instrument.expiry,
      instrument.strike,
      instrument.optionType,
      instrument.tickSize,
      instrument.lotSize,
      instrument.precision,
      instrument.name,
    );
  }
}
