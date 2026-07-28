/**
 * Which executor a trade uses — PAPER (`PaperExecutor`, pure simulation) or
 * LIVE (`AngelOneExecutor`, real broker orders). Lives here (not in
 * `trade-lifecycle`, which depends on `trading-engine` for `TradeSnapshot`
 * etc.) because `CreateTradeParams`/`Trade` need it directly; re-exported
 * from `@modules/trade-lifecycle/models/trade-record.model` for existing
 * callers.
 */
export type TradingMode = 'PAPER' | 'LIVE';
