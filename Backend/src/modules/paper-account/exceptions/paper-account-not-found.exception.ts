import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class PaperAccountNotFoundException extends BaseException {
  readonly code = 'PAPER_ACCOUNT_NOT_FOUND';
  readonly httpStatus = HttpStatus.NOT_FOUND;
}
