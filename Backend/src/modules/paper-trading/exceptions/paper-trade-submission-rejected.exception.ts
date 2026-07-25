import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

/** Covers every synchronous rejection `OrderQueueService.submitTrade()` can return before a queue item even exists: validation failure, risk-management rejection, a full queue, or the kill switch. */
export class PaperTradeSubmissionRejectedException extends BaseException {
  readonly code = 'PAPER_TRADE_SUBMISSION_REJECTED';
  readonly httpStatus = HttpStatus.UNPROCESSABLE_ENTITY;
}
