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
 * Step 7: targets must all be positive finite numbers, strictly monotonic in
 * the trade's favorable direction (increasing for LONG, decreasing for
 * SHORT), and the first target must be beyond the entry price. Same rule for
 * 1, 3, 5, 10, or any other number of targets — mirrors the Trading Engine's
 * own generalized target system (Phase 5).
 */
@Injectable()
export class TargetRule implements IValidationRule {
  readonly name = 'TargetRule';

  constructor(@Inject(CLOCK) private readonly clock: IClock) {}

  // eslint-disable-next-line @typescript-eslint/require-await -- kept async to match IValidationRule; nothing here needs to await
  async validate(
    context: ValidationContext,
  ): Promise<Result<void, ValidationFailure>> {
    const { targets, direction, entryTriggerPrice } = context.request;

    if (!targets.every((target) => Number.isFinite(target) && target > 0)) {
      return this.fail('Every target must be a positive finite number');
    }

    if (direction === TradeDirection.LONG) {
      if (targets[0] <= entryTriggerPrice) {
        return this.fail(
          'A LONG first target must be above the entry trigger price',
        );
      }
      for (let i = 1; i < targets.length; i += 1) {
        if (targets[i] <= targets[i - 1]) {
          return this.fail('LONG targets must be strictly increasing');
        }
      }
    } else {
      if (targets[0] >= entryTriggerPrice) {
        return this.fail(
          'A SHORT first target must be below the entry trigger price',
        );
      }
      for (let i = 1; i < targets.length; i += 1) {
        if (targets[i] >= targets[i - 1]) {
          return this.fail('SHORT targets must be strictly decreasing');
        }
      }
    }

    return Result.ok(undefined);
  }

  private fail(message: string): Result<void, ValidationFailure> {
    return Result.fail(
      buildValidationFailure(
        ValidationFailureCode.INVALID_TARGETS,
        message,
        this.name,
        this.clock,
      ),
    );
  }
}
