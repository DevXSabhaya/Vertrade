import { Inject, Injectable } from '@nestjs/common';
import { Result } from '@shared/types/result';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { TradingEngineService } from '@modules/trading-engine/trading-engine.service';
import { TradeStateTransitions } from '@modules/trading-engine/domain/trade-state-transitions';
import type { IValidationRule } from '../interfaces/validation-rule.interface';
import type { ValidationContext } from '../models/validation-context';
import type { ValidationFailure } from '../models/validation-failure.model';
import { ValidationFailureCode } from '../models/validation-failure-code.enum';
import { buildValidationFailure } from '../models/build-validation-failure.util';

/**
 * Step 8: rejects a new trade if this instrument already has a non-terminal
 * trade in flight — the exact scenario that would otherwise let a duplicate
 * button click or a retried request open two positions on the same
 * instrument.
 */
@Injectable()
export class DuplicateTradeRule implements IValidationRule {
  readonly name = 'DuplicateTradeRule';

  constructor(
    private readonly tradingEngineService: TradingEngineService,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await -- kept async to match IValidationRule; getAllTrades() is synchronous (in-memory)
  async validate(
    context: ValidationContext,
  ): Promise<Result<void, ValidationFailure>> {
    const instrumentToken = context.resolvedInstrument?.instrumentToken;
    if (!instrumentToken) {
      // InstrumentExistsRule already failed earlier in the pipeline if this
      // is unset; nothing to check here defensively.
      return Result.ok(undefined);
    }

    const hasActiveTrade = this.tradingEngineService
      .getAllTrades()
      .some(
        (trade) =>
          trade.instrumentToken === instrumentToken &&
          !TradeStateTransitions.isTerminal(trade.state),
      );

    if (hasActiveTrade) {
      return Result.fail(
        buildValidationFailure(
          ValidationFailureCode.DUPLICATE_ACTIVE_TRADE,
          `An active trade already exists for instrument ${instrumentToken}`,
          this.name,
          this.clock,
        ),
      );
    }

    return Result.ok(undefined);
  }
}
