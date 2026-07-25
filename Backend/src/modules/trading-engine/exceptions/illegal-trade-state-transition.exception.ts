import { HttpStatus } from '@nestjs/common';
import { BaseException } from '@common/exceptions/base.exception';
import type { TradeState } from '../domain/trade-state.enum';

export class IllegalTradeStateTransitionException extends BaseException {
  readonly code = 'TRADE_ILLEGAL_STATE_TRANSITION';
  readonly httpStatus = HttpStatus.CONFLICT;

  constructor(from: TradeState, to: TradeState) {
    super(`Illegal trade state transition: ${from} -> ${to}`, { from, to });
  }
}
