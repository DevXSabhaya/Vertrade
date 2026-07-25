import { Inject, Injectable } from '@nestjs/common';
import { Result } from '@shared/types/result';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { InstrumentResolverService } from '@modules/instrument-resolver/instrument-resolver.service';
import type { IValidationRule } from '../interfaces/validation-rule.interface';
import type { ValidationContext } from '../models/validation-context';
import type { ValidationFailure } from '../models/validation-failure.model';
import { ValidationFailureCode } from '../models/validation-failure-code.enum';
import { buildValidationFailure } from '../models/build-validation-failure.util';

/**
 * Step 2: resolves the raw user-typed symbol via the Instrument Resolver
 * Service (Phase 3) and attaches the result to the context — every rule
 * after this one can read `context.resolvedInstrument`. Never lets a raw
 * symbol string reach the Trading Engine.
 */
@Injectable()
export class InstrumentExistsRule implements IValidationRule {
  readonly name = 'InstrumentExistsRule';

  constructor(
    private readonly instrumentResolverService: InstrumentResolverService,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await -- kept async to match IValidationRule; resolve() itself is synchronous
  async validate(
    context: ValidationContext,
  ): Promise<Result<void, ValidationFailure>> {
    try {
      context.resolvedInstrument = this.instrumentResolverService.resolve(
        context.request.rawSymbol,
      );
      return Result.ok(undefined);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to resolve instrument';
      return Result.fail(
        buildValidationFailure(
          ValidationFailureCode.INSTRUMENT_NOT_FOUND,
          message,
          this.name,
          this.clock,
        ),
      );
    }
  }
}
