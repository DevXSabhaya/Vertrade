import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

export class ReconciliationReportNotFoundException extends BaseException {
  readonly code = 'RECONCILIATION_REPORT_NOT_FOUND';
  readonly httpStatus = HttpStatus.NOT_FOUND;
}
