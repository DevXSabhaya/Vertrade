import { HttpStatus } from '@nestjs/common';
import { BaseException } from './base.exception';

/** Input failed validation before it could reach any business logic. */
export class ValidationException extends BaseException {
  readonly code = 'VALIDATION_ERROR';
  readonly httpStatus = HttpStatus.BAD_REQUEST;
  readonly errors: string[];

  constructor(
    message: string,
    errors: string[] = [],
    metadata?: Record<string, unknown>,
  ) {
    super(message, metadata);
    this.errors = errors;
  }
}
