import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class PaperAccountResetBlockedException extends BaseException {
  readonly code = 'PAPER_ACCOUNT_RESET_BLOCKED';
  readonly httpStatus = HttpStatus.CONFLICT;
}
