import type { ValidationFailureCode } from './validation-failure-code.enum';

/**
 * Normal validation failures are data, never exceptions — a request that
 * fails "Quantity must be positive" is an everyday, expected outcome, not an
 * exceptional one. Typed exceptions remain reserved for genuinely
 * unexpected/infrastructure-level failures elsewhere in the system.
 */
export interface ValidationFailure {
  readonly code: ValidationFailureCode;
  readonly reason: string;
  readonly message: string;
  readonly failedRule: string;
  readonly timestamp: string;
}
