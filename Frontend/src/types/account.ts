export type PaperAccountStatus = 'ACTIVE' | 'DISABLED'

export interface PaperAccount {
  readonly userId: string
  readonly initialBalance: number
  readonly availableBalance: number
  readonly reservedMargin: number
  readonly realizedPnl: number
  readonly status: PaperAccountStatus
  readonly createdAt: string
  readonly updatedAt: string
}

export interface PaperAccountSummary extends PaperAccount {
  readonly equity: number
}

export interface PnlSummary extends PaperAccountSummary {
  readonly unrealizedPnl: number
  readonly totalPnl: number
}
