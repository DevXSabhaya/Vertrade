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

/**
 * Step 6: the stop loss must be a positive finite number on the correct side
 * of the entry price for the trade's direction (below entry for LONG, above
 * entry for SHORT) — otherwise it can never be triggered as a stop.
 */
@Injectable()
export class StopLossRule implements IValidationRule {
  readonly name = 'StopLossRule';

  constructor(@Inject(CLOCK) private readonly clock: IClock) {}

  // eslint-disable-next-line @typescript-eslint/require-await -- kept async to match IValidationRule; nothing here needs to await
  async validate(
    context: ValidationContext,
  ): Promise<Result<void, ValidationFailure>> {
    const { initialStopLoss, entryTriggerPrice, direction } = context.request;

    if (!Number.isFinite(initialStopLoss) || initialStopLoss <= 0) {
      return this.fail('Stop loss must be a positive finite number');
    }

    if (
      direction === TradeDirection.LONG &&
      initialStopLoss >= entryTriggerPrice
    ) {
      return this.fail(
        'A LONG stop loss must be below the entry trigger price',
      );
    }
    if (
      direction === TradeDirection.SHORT &&
      initialStopLoss <= entryTriggerPrice
    ) {
      return this.fail(
        'A SHORT stop loss must be above the entry trigger price',
      );
    }

    return Result.ok(undefined);
  }

  private fail(message: string): Result<void, ValidationFailure> {
    return Result.fail(
      buildValidationFailure(
        ValidationFailureCode.INVALID_STOP_LOSS,
        message,
        this.name,
        this.clock,
      ),
    );
  }
}
