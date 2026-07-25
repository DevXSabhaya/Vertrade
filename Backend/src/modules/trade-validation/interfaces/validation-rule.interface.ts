import type { Result } from '@shared/types/result';
import type { ValidationContext } from '../models/validation-context';
import type { ValidationFailure } from '../models/validation-failure.model';

/**
 * Every rule is fully isolated: it knows nothing about the other rules, the
 * pipeline order, or what ran before it besides whatever the previous rule
 * chose to attach to the ValidationContext. Adding a new rule is always
 * "write this interface + register it in the Rule Registry" — never a change
 * to any existing rule or to TradeValidationService (Open/Closed).
 */
export interface IValidationRule {
  /** Used verbatim as ValidationFailure.failedRule. */
  readonly name: string;

  validate(
    context: ValidationContext,
  ): Promise<Result<void, ValidationFailure>>;
}
