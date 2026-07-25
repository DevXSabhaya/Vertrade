import { Inject, Injectable } from '@nestjs/common';
import { Result } from '@shared/types/result';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { FeatureFlagsService } from '@core/feature-flags/feature-flag.service';
import { RiskEvaluationService } from '@modules/risk-management/risk-evaluation.service';
import type { IValidationRule } from '../interfaces/validation-rule.interface';
import type { ValidationContext } from '../models/validation-context';
import type { ValidationFailure } from '../models/validation-failure.model';
import { ValidationFailureCode } from '../models/validation-failure-code.enum';
import { buildValidationFailure } from '../models/build-validation-failure.util';

const RISK_MANAGEMENT_DISABLED_FLAG = 'RISK_MANAGEMENT_DISABLED';

/**
 * Step 11 (new, Phase 11): the Risk Management Engine gate — runs after the
 * legacy `RiskRule` (Phase 7's simpler, hardcoded-per-trading-mode checks,
 * left untouched) and before `FeatureFlagRule` (the static kill switch,
 * also left untouched). Delegates every actual decision to
 * `RiskEvaluationService` — this rule is only the adapter translating a
 * `RiskDecision` into the `ValidationFailure` shape
 * `TradeValidationService`'s pipeline already understands, exactly the same
 * adapter role `RiskRule`/`FeatureFlagRule` already play for their own
 * checks. Never re-implements a single risk calculation itself.
 *
 * Guarded by `RISK_MANAGEMENT_DISABLED_FLAG` (inverted-default: unset means
 * enabled) purely as an emergency escape hatch — Risk Management is meant to
 * be a first-class, always-on protection layer, not something toggled off
 * in normal operation.
 */
@Injectable()
export class RiskManagementRule implements IValidationRule {
  readonly name = 'RiskManagementRule';

  constructor(
    private readonly riskEvaluationService: RiskEvaluationService,
    private readonly featureFlagsService: FeatureFlagsService,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async validate(
    context: ValidationContext,
  ): Promise<Result<void, ValidationFailure>> {
    const disabled = await this.featureFlagsService.isEnabled(
      RISK_MANAGEMENT_DISABLED_FLAG,
    );
    if (disabled) {
      return Result.ok(undefined);
    }

    const resolvedInstrument = context.resolvedInstrument;
    if (!resolvedInstrument) {
      // InstrumentExistsRule runs earlier in the pipeline and already
      // stopped the chain if this were ever unset — defensive only.
      return Result.ok(undefined);
    }

    const decision = await this.riskEvaluationService.evaluate({
      rawSymbol: context.request.rawSymbol,
      instrumentToken: resolvedInstrument.instrumentToken,
      tradingSymbol: resolvedInstrument.tradingSymbol,
      direction: context.request.direction,
      quantity: context.request.quantity,
      entryTriggerPrice: context.request.entryTriggerPrice,
      initialStopLoss: context.request.initialStopLoss,
      targets: context.request.targets,
    });

    if (!decision.allowed) {
      return Result.fail(
        buildValidationFailure(
          ValidationFailureCode.RISK_MANAGEMENT_REJECTED,
          decision.message,
          this.name,
          this.clock,
        ),
      );
    }

    return Result.ok(undefined);
  }
}
