import type { ResolvedInstrument } from '@modules/instrument-resolver/resolved-instrument.vo';
import type { ValidationFailure } from './validation-failure.model';

/**
 * Exactly one of the two static factories produced this — `isValid`
 * discriminates which fields are populated. The Trading Engine must never
 * receive a trade that didn't come from `ValidationResult.valid()`.
 */
export class ValidationResult {
  private constructor(
    public readonly isValid: boolean,
    public readonly resolvedInstrument?: ResolvedInstrument,
    public readonly failure?: ValidationFailure,
  ) {}

  static valid(resolvedInstrument: ResolvedInstrument): ValidationResult {
    return new ValidationResult(true, resolvedInstrument, undefined);
  }

  static invalid(failure: ValidationFailure): ValidationResult {
    return new ValidationResult(false, undefined, failure);
  }
}
