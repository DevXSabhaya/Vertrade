import { OrderSide } from './order-side.enum';
import { OrderPriceType } from './order-price-type.enum';

/**
 * Broker-independent order request. Every field here comes from a resolved
 * instrument (Phase 3) plus trade sizing — never a raw symbol string, and
 * never anything broker-specific (no Dhan field names leak in here).
 */
export class OrderRequest {
  constructor(
    public readonly exchange: string,
    public readonly tradingSymbol: string,
    public readonly instrumentToken: string,
    public readonly side: OrderSide,
    public readonly quantity: number,
    public readonly priceType: OrderPriceType,
    public readonly price?: number,
    /** Carries `Trade.metadata` through (e.g. `liveTradingConfirmed`) — read by `LiveOrderSafetyGateService` in `DhanExecutor`. Never read by `PaperExecutor`. */
    public readonly metadata?: Readonly<Record<string, unknown>>,
    /** Required for `SL`/`SL_M` — the price at which the stop activates. Unused for `MARKET`/`LIMIT`. */
    public readonly triggerPrice?: number,
  ) {}
}
