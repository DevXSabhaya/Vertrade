import type { IClock } from '@shared/clock/clock.interface';
import type { ValidationFailureCode } from './validation-failure-code.enum';
import type { ValidationFailure } from './validation-failure.model';

export function buildValidationFailure(
  code: ValidationFailureCode,
  message: string,
  failedRule: string,
  clock: IClock,
): ValidationFailure {
  return {
    code,
    reason: code,
    message,
    failedRule,
    timestamp: clock.now().toISOString(),
  };
}
