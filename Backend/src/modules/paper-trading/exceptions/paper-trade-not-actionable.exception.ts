import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';

/** Thrown when exit/cancel is requested against a paper trade whose current status doesn't support that action (e.g. exiting a still-PENDING trade, or cancelling one that is already OPEN). */
export class PaperTradeNotActionableException extends BaseException {
  readonly code = 'PAPER_TRADE_NOT_ACTIONABLE';
  readonly httpStatus = HttpStatus.CONFLICT;
}
