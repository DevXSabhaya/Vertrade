import { OrderStatus } from './models/order-status.enum';

/**
 * Queued via PaperExecutor.queueNextFill() to deterministically control the
 * outcome of the NEXT placeEntryOrder()/exitPosition() call. No instruction
 * queued means: fill in full at the request's price (LIMIT) or the last price
 * set via setMarketPrice() (MARKET) — and if no price is available at all for
 * a MARKET order, placement throws rather than guessing.
 */
export interface PaperFillInstruction {
  status:
    | OrderStatus.OPEN
    | OrderStatus.FILLED
    | OrderStatus.PARTIALLY_FILLED
    | OrderStatus.REJECTED;
  filledQuantity?: number;
  fillPrice?: number;
  message?: string;
}
