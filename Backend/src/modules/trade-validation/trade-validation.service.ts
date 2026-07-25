import { Injectable } from '@nestjs/common';
import type { ResolvedInstrument } from '@modules/instrument-resolver/resolved-instrument.vo';
import { RuleRegistry } from './rule-registry';
import { ValidationContext } from './models/validation-context';
import { ValidationResult } from './models/validation-result.model';
import type { TradeValidationRequest } from './models/trade-validation-request.model';

/**
 * The single gate a trade request must pass through before it can ever
 * become a Trade aggregate. Runs every registered rule in the Rule
 * Registry's fixed order, stopping at the first failure — the Trading Engine
 * must never see a request that failed any rule here.
 */
@Injectable()
export class TradeValidationService {
  constructor(private readonly ruleRegistry: RuleRegistry) {}

  async validate(request: TradeValidationRequest): Promise<ValidationResult> {
    const context = new ValidationContext(request);

    for (const rule of this.ruleRegistry.getRules()) {
      const result = await rule.validate(context);
      if (result.isFailure) {
        return ValidationResult.invalid(result.error);
      }
    }

    return ValidationResult.valid(
      context.resolvedInstrument as ResolvedInstrument,
    );
  }
}
