import { Inject, Injectable } from '@nestjs/common';
import { Result } from '@shared/types/result';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import type { IValidationRule } from '../interfaces/validation-rule.interface';
import type { ValidationContext } from '../models/validation-context';
import type { ValidationFailure } from '../models/validation-failure.model';
import { ValidationFailureCode } from '../models/validation-failure-code.enum';
import { buildValidationFailure } from '../models/build-validation-failure.util';

/** Step 1: pure shape/presence checks — no I/O, no business logic. */
@Injectable()
export class RequiredFieldsRule implements IValidationRule {
  readonly name = 'RequiredFieldsRule';

  constructor(@Inject(CLOCK) private readonly clock: IClock) {}

  // eslint-disable-next-line @typescript-eslint/require-await -- kept async to match IValidationRule; nothing here needs to await
  async validate(
    context: ValidationContext,
  ): Promise<Result<void, ValidationFailure>> {
    const { request } = context;

    if (!request.rawSymbol || request.rawSymbol.trim().length === 0) {
      return this.fail('rawSymbol is required');
    }
    if (
      request.direction !== TradeDirection.LONG &&
      request.direction !== TradeDirection.SHORT
    ) {
      return this.fail('direction is required and must be LONG or SHORT');
    }
    if (request.quantity === undefined || request.quantity === null) {
      return this.fail('quantity is required');
    }
    if (
      request.entryTriggerPrice === undefined ||
      request.entryTriggerPrice === null
    ) {
      return this.fail('entryTriggerPrice is required');
    }
    if (
      request.initialStopLoss === undefined ||
      request.initialStopLoss === null
    ) {
      return this.fail('initialStopLoss is required');
    }
    if (!request.targets || request.targets.length === 0) {
      return this.fail('at least one target is required');
    }

    return Result.ok(undefined);
  }

  private fail(message: string): Result<void, ValidationFailure> {
    return Result.fail(
      buildValidationFailure(
        ValidationFailureCode.REQUIRED_FIELD_MISSING,
        message,
        this.name,
        this.clock,
      ),
    );
  }
}
