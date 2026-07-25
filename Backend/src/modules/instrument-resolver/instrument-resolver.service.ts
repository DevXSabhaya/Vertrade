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

@Injectable()
export class InstrumentResolverService {
  constructor(
    private readonly instrumentMasterService: InstrumentMasterService,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  resolve(rawSymbol: string): ResolvedInstrument {
    try {
      const resolved = this.doResolve(rawSymbol);
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

  private doResolve(rawSymbol: string): ResolvedInstrument {
    const parsed = parseSymbolInput(rawSymbol);

    const candidates = this.instrumentMasterService
      .getCache()
      .findByUnderlying(parsed.underlying);
    if (candidates.length === 0) {
      throw new UnknownSymbolException(
        `No instrument found for underlying "${parsed.underlying}"`,
      );
    }

    let matches: readonly Instrument[];

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

      matches = optionCandidates.filter((i) => i.strike === parsed.strike);
      if (matches.length === 0) {
        throw new InvalidStrikeException(
          `Strike ${parsed.strike} is not available for "${parsed.underlying} ${parsed.optionType}"`,
        );
      }
    } else {
      matches = candidates.filter((i) => i.optionType === null);
      if (matches.length === 0) {
        throw new UnknownSymbolException(
          `No non-option instrument found for "${parsed.underlying}"`,
        );
      }
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
    );
  }
}
