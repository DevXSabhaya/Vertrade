import { Inject, Injectable } from '@nestjs/common';
import { Result } from '@shared/types/result';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import type { IValidationRule } from '../interfaces/validation-rule.interface';
import type { ValidationContext } from '../models/validation-context';
import type { ValidationFailure } from '../models/validation-failure.model';
import { ValidationFailureCode } from '../models/validation-failure-code.enum';
import { buildValidationFailure } from '../models/build-validation-failure.util';

/** Step 5: the entry trigger price must be a positive, finite number. */
@Injectable()
export class EntryPriceRule implements IValidationRule {
  readonly name = 'EntryPriceRule';

  constructor(@Inject(CLOCK) private readonly clock: IClock) {}

  // eslint-disable-next-line @typescript-eslint/require-await -- kept async to match IValidationRule; nothing here needs to await
  async validate(
    context: ValidationContext,
  ): Promise<Result<void, ValidationFailure>> {
    const { entryTriggerPrice } = context.request;
    if (!Number.isFinite(entryTriggerPrice) || entryTriggerPrice <= 0) {
      return Result.fail(
        buildValidationFailure(
          ValidationFailureCode.INVALID_ENTRY_PRICE,
          'Entry trigger price must be a positive finite number',
          this.name,
          this.clock,
        ),
      );
    }
    return Result.ok(undefined);
  }
}
