import { HttpStatus } from '@nestjs/common';
import { BaseException } from './base.exception';

/** A business rule was violated (e.g. a trade fails a risk check). */
export class BusinessException extends BaseException {
  readonly code = 'BUSINESS_RULE_VIOLATION';
  readonly httpStatus = HttpStatus.UNPROCESSABLE_ENTITY;
}
