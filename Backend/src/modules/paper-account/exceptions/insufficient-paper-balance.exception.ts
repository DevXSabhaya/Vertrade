import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

/** Also thrown when the account exists but is `DISABLED` — the underlying reservation query rejects both cases identically, and either way the caller cannot trade right now. */
export class InsufficientPaperBalanceException extends BaseException {
  readonly code = 'INSUFFICIENT_PAPER_BALANCE';
  readonly httpStatus = HttpStatus.UNPROCESSABLE_ENTITY;
}
