import { Inject, Injectable } from '@nestjs/common';
import { Result } from '@shared/types/result';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import type { IValidationRule } from '../interfaces/validation-rule.interface';
import type { ValidationFailure } from '../models/validation-failure.model';
import { ValidationFailureCode } from '../models/validation-failure-code.enum';
import { buildValidationFailure } from '../models/build-validation-failure.util';
import { TRADING_HOURS_CONFIG } from '../trade-validation.constants';
import {
  isWithinTradingHours,
  type TradingHoursConfig,
} from '../models/trading-hours.model';

/** Step 3: no new trade may be started while the market is closed. */
@Injectable()
export class MarketOpenRule implements IValidationRule {
  readonly name = 'MarketOpenRule';

  constructor(
    @Inject(TRADING_HOURS_CONFIG)
    private readonly tradingHours: TradingHoursConfig,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await -- kept async to match IValidationRule; nothing here needs to await
  async validate(): Promise<Result<void, ValidationFailure>> {
    const now = this.clock.now();
    if (!isWithinTradingHours(now, this.tradingHours)) {
      return Result.fail(
        buildValidationFailure(
          ValidationFailureCode.MARKET_CLOSED,
          'The market is currently closed',
          this.name,
          this.clock,
        ),
      );
    }
    return Result.ok(undefined);
  }
}
