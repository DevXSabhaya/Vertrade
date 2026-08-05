import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class BrokerAccountNotFoundException extends BaseException {
  readonly code = 'BROKER_ACCOUNT_NOT_FOUND';
  readonly httpStatus = HttpStatus.NOT_FOUND;

  constructor(accountId: string) {
    super(`No broker account found with id ${accountId}`);
  }
}
