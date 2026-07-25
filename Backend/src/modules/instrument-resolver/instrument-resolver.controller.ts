import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { InstrumentMasterService } from '@modules/instrument-master/instrument-master.service';
import type { Instrument } from '@modules/instrument-master/entities/instrument.entity';
import { InstrumentResolverService } from './instrument-resolver.service';
import { ResolveInstrumentQueryDto } from './dto/resolve-instrument-query.dto';
import { SearchInstrumentsQueryDto } from './dto/search-instruments-query.dto';

interface ResolvedInstrumentResponseBody {
  readonly exchange: string;
  readonly segment: string;
  readonly tradingSymbol: string;
  readonly instrumentToken: string;
  readonly expiry: string | null;
  readonly strike: number | null;
  readonly optionType: string | null;
  readonly tickSize: number;
  readonly lotSize: number;
  readonly precision: number;
}

interface InstrumentSearchResultBody {
  readonly displayName: string;
  readonly symbol: string;
  readonly exchange: string;
  readonly token: string;
  readonly instrumentType: 'EQUITY' | 'OPTION' | 'FUTURE' | 'OTHER';
  readonly expiry: string | null;
  readonly strike: number | null;
  readonly optionType: string | null;
  readonly lotSize: number;
  readonly tickSize: number;
}

const DEFAULT_SEARCH_LIMIT = 20;

function classifyInstrumentType(
  instrument: Instrument,
): InstrumentSearchResultBody['instrumentType'] {
  if (instrument.optionType) return 'OPTION';
  if (instrument.segment.startsWith('FUT')) return 'FUTURE';
  if (instrument.segment === 'EQ') return 'EQUITY';
  return 'OTHER';
}

function toSearchResult(instrument: Instrument): InstrumentSearchResultBody {
  return {
    displayName: instrument.optionType
      ? `${instrument.name} ${instrument.strike ?? ''} ${instrument.optionType}`.trim()
      : instrument.name,
    symbol: instrument.tradingSymbol,
    exchange: instrument.exchange,
    token: instrument.token,
    instrumentType: classifyInstrumentType(instrument),
    expiry: instrument.expiry ? instrument.expiry.toISOString() : null,
    strike: instrument.strike,
    optionType: instrument.optionType,
    lotSize: instrument.lotSize,
    tickSize: instrument.tickSize,
  };
}

/**
 * A lightweight, side-effect-free preview of what a natural trading call
 * (e.g. "SENSEX 77200 CE") will resolve to — same `InstrumentResolverService`
 * the trade-creation pipeline itself uses (`InstrumentExistsRule`), just
 * without submitting a trade or reserving any margin. Lets the frontend show
 * the resolved instrument and block trade submission until resolution
 * succeeds, instead of only finding out the symbol was invalid after
 * attempting to place an order.
 */
@Controller('instruments')
@UseGuards(JwtAuthGuard)
export class InstrumentResolverController {
  constructor(
    private readonly resolverService: InstrumentResolverService,
    private readonly instrumentMasterService: InstrumentMasterService,
  ) {}

  @Get('resolve')
  resolve(
    @Query() dto: ResolveInstrumentQueryDto,
  ): ResolvedInstrumentResponseBody {
    const resolved = this.resolverService.resolve(dto.query);
    return {
      exchange: resolved.exchange,
      segment: resolved.segment,
      tradingSymbol: resolved.tradingSymbol,
      instrumentToken: resolved.instrumentToken,
      expiry: resolved.expiry ? resolved.expiry.toISOString() : null,
      strike: resolved.strike,
      optionType: resolved.optionType,
      tickSize: resolved.tickSize,
      lotSize: resolved.lotSize,
      precision: resolved.precision,
    };
  }

  /**
   * Multi-result, permissive lookup for an instrument picker — unlike
   * `resolve`, never throws on an ambiguous or partial query; the frontend
   * shows the returned list and the user picks one before a trade can ever
   * be created. Never used to place an order directly — trade creation
   * still resolves the user's final selection through `resolve`/the
   * validation pipeline, which is where ambiguity/expiry/segment checks
   * remain enforced.
   */
  @Get('search')
  search(
    @Query() dto: SearchInstrumentsQueryDto,
  ): InstrumentSearchResultBody[] {
    const instruments = this.instrumentMasterService.search(
      dto.q,
      dto.limit ?? DEFAULT_SEARCH_LIMIT,
    );
    return instruments.map(toSearchResult);
  }
}
