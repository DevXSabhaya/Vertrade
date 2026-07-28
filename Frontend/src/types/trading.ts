export type TradeDirection = 'LONG' | 'SHORT'

export type TradingMode = 'PAPER' | 'LIVE'

export type PaperTradeStatus =
  | 'PENDING'
  | 'OPEN'
  | 'CLOSED'
  | 'FAILED'
  | 'CANCELLED'

export type TradeState =
  | 'DRAFT'
  | 'WAITING_ENTRY'
  | 'ENTRY_PENDING'
  | 'ENTRY_FILLED'
  | 'ACTIVE'
  | 'TARGET_HIT'
  | 'TRAILING_SL_UPDATED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'FAILED'
  | 'RECOVERY'
  | 'ERROR'

export type ExitReason =
  | 'STOPLOSS'
  | 'TARGET'
  | 'MANUAL'
  | 'FORCE'
  | 'MARKET_CLOSE'
  | 'BROKER_DISCONNECT'
  | 'EMERGENCY'

export interface TradeRecord {
  readonly tradeId: string
  readonly signalId: string | null
  readonly brokerOrderId: string | null
  readonly brokerPositionId: string | null
  readonly instrument: string
  readonly exchange: string
  readonly token: string
  readonly direction: TradeDirection
  readonly entryPrice: number
  readonly quantity: number
  readonly filledQuantity: number
  readonly openQuantity: number
  readonly exitedQuantity: number
  readonly averagePrice: number | null
  readonly exitPrice: number | null
  readonly status: TradeState
  readonly createdAt: string
  readonly updatedAt: string
  readonly targets: readonly number[]
  readonly currentTarget: number | null
  readonly stopLoss: number
  readonly currentStopLoss: number
  readonly trailingEnabled: boolean
  readonly riskReward: number | null
  readonly realizedPnl: number | null
  readonly unrealizedPnl: number | null
  readonly exitReason: ExitReason | null
  readonly positionDurationMs: number
  readonly mode: TradingMode
}

export interface ResolvedInstrument {
  readonly underlying: string
  readonly exchange: string
  readonly segment: string
  readonly tradingSymbol: string
  readonly instrumentToken: string
  readonly expiry: string | null
  readonly strike: number | null
  readonly optionType: 'CE' | 'PE' | null
  readonly tickSize: number
  readonly lotSize: number
  readonly precision: number
}

/** One exact tradable contract among possibly several expiries for the same underlying/strike/optionType — returned by GET /instruments/expiries. */
export interface InstrumentExpiryChoice extends ResolvedInstrument {
  /** Most recently observed price for this exact contract, or null if no tick has arrived yet — never a stale/guessed value. */
  readonly currentPrice: number | null
  readonly lastUpdated: string | null
}

export interface PaperTradeView {
  readonly id: string
  readonly status: PaperTradeStatus
  readonly tradeId: string | null
  readonly rawSymbol: string
  readonly direction: TradeDirection
  readonly quantity: number
  readonly entryTriggerPrice: number
  readonly initialStopLoss: number
  readonly reservedAmount: number
  readonly failureReason: string | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly trade: TradeRecord | null
}

export interface CreatePaperTradePayload {
  readonly rawSymbol: string
  readonly direction: TradeDirection
  readonly quantity: number
  readonly entryTriggerPrice: number
  readonly initialStopLoss: number
  readonly targets: number[]
  /** Only meaningful when the deployment's trading mode is LIVE — ignored entirely in PAPER mode. Required (in addition to server-side gating) before a real broker order can ever be placed. */
  readonly liveTradingConfirmed?: boolean
}

export type QueueItemState =
  | 'QUEUED'
  | 'LOCKED'
  | 'PROCESSING'
  | 'SUBMITTED'
  | 'COMPLETED'
  | 'RETRYING'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'

export interface QueueItemHistoryEntry {
  readonly state: QueueItemState
  readonly occurredAt: string
  readonly reason?: string
}

export interface OrderRequestSummary {
  readonly rawSymbol: string
  readonly direction: TradeDirection
  readonly quantity: number
  readonly entryTriggerPrice: number
}

export interface ResolvedInstrumentSummary {
  readonly tradingSymbol: string
  readonly exchange: string
}

export interface QueueItemSnapshot {
  readonly id: string
  readonly idempotencyKey: string
  readonly orderType: string
  readonly state: QueueItemState
  readonly request: OrderRequestSummary
  readonly resolvedInstrument: ResolvedInstrumentSummary
  readonly attempts: number
  readonly lockOwner: string | null
  readonly lockedAt: string | null
  readonly lastError: string | null
  readonly resultTradeId: string | null
  readonly history: readonly QueueItemHistoryEntry[]
  readonly createdAt: string
  readonly updatedAt: string
}
