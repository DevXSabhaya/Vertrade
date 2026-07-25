import { Inject, Injectable } from '@nestjs/common';
import { Result } from '@shared/types/result';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import type { IValidationRule } from '../interfaces/validation-rule.interface';
import type { ValidationContext } from '../models/validation-context';
import type { ValidationFailure } from '../models/validation-failure.model';
import { ValidationFailureCode } from '../models/validation-failure-code.enum';
import { buildValidationFailure } from '../models/build-validation-failure.util';

/**
 * Step 4: quantity must be a positive integer and, once the instrument is
 * known (InstrumentExistsRule already ran), an exact multiple of its lot
 * size — the broker will reject anything else anyway.
 */
@Injectable()
export class QuantityRule implements IValidationRule {
  readonly name = 'QuantityRule';

  constructor(@Inject(CLOCK) private readonly clock: IClock) {}

  // eslint-disable-next-line @typescript-eslint/require-await -- kept async to match IValidationRule; nothing here needs to await
  async validate(
    context: ValidationContext,
  ): Promise<Result<void, ValidationFailure>> {
    const { quantity } = context.request;

    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isInteger(quantity)
    ) {
      return this.fail('Quantity must be a positive integer');
    }

    const lotSize = context.resolvedInstrument?.lotSize;
    if (lotSize && lotSize > 0 && quantity % lotSize !== 0) {
      return this.fail(
        `Quantity must be a multiple of the lot size (${lotSize})`,
      );
    }

    return Result.ok(undefined);
  }

  private fail(message: string): Result<void, ValidationFailure> {
    return Result.fail(
      buildValidationFailure(
        ValidationFailureCode.INVALID_QUANTITY,
        message,
        this.name,
        this.clock,
      ),
    );
  }
}
