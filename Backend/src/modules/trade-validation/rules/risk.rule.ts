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
import { RISK_LIMITS_CONFIG } from '../trade-validation.constants';
import {
  isSameUtcDay,
  type RiskLimitsConfig,
} from '../models/risk-limits.model';

/**
 * Step 9: the Risk Gate. Trading-hours enforcement already happened in
 * MarketOpenRule earlier in the pipeline, so it is deliberately not repeated
 * here. Which RiskLimitsConfig this rule enforces (Paper vs Live) is decided
 * once, at module-wiring time, by TradeValidationModule — this rule only
 * ever enforces whatever limits it is given.
 */
@Injectable()
export class RiskRule implements IValidationRule {
  readonly name = 'RiskRule';

  constructor(
    private readonly tradingEngineService: TradingEngineService,
    @Inject(RISK_LIMITS_CONFIG) private readonly riskLimits: RiskLimitsConfig,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await -- kept async to match IValidationRule; getAllTrades() is synchronous (in-memory)
  async validate(
    context: ValidationContext,
  ): Promise<Result<void, ValidationFailure>> {
    if (context.request.quantity > this.riskLimits.maxQuantity) {
      return this.fail(
        `Quantity exceeds the maximum allowed per trade (${this.riskLimits.maxQuantity})`,
      );
    }

    const trades = this.tradingEngineService.getAllTrades();
    const now = this.clock.now();

    const openTradeCount = trades.filter(
      (trade) => !TradeStateTransitions.isTerminal(trade.state),
    ).length;
    if (openTradeCount >= this.riskLimits.maxOpenTrades) {
      return this.fail(
        `Maximum open trades limit reached (${this.riskLimits.maxOpenTrades})`,
      );
    }

    const todaysTradeCount = trades.filter((trade) =>
      isSameUtcDay(new Date(trade.createdAt), now),
    ).length;
    if (todaysTradeCount >= this.riskLimits.maxDailyTrades) {
      return this.fail(
        `Maximum daily trades limit reached (${this.riskLimits.maxDailyTrades})`,
      );
    }

    const todaysRealizedPnl = trades
      .filter(
        (trade) =>
          trade.realizedPnl !== null &&
          isSameUtcDay(new Date(trade.updatedAt), now),
      )
      .reduce((sum, trade) => sum + (trade.realizedPnl ?? 0), 0);
    if (todaysRealizedPnl <= -this.riskLimits.maxDailyLoss) {
      return this.fail(
        `Maximum daily loss limit reached (${this.riskLimits.maxDailyLoss})`,
      );
    }

    return Result.ok(undefined);
  }

  private fail(message: string): Result<void, ValidationFailure> {
    return Result.fail(
      buildValidationFailure(
        ValidationFailureCode.RISK_LIMIT_EXCEEDED,
        message,
        this.name,
        this.clock,
      ),
    );
  }
}
