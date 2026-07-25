import { apiFetch } from '@/lib/api-client'
import type {
  CreatePaperTradePayload,
  PaperTradeStatus,
  PaperTradeView,
  QueueItemSnapshot,
  TradeDirection,
} from '@/types/trading'

export interface TradeHistoryParams {
  limit?: number
  offset?: number
  status?: PaperTradeStatus
  side?: TradeDirection
  instrument?: string
  dateFrom?: string
  dateTo?: string
}

export const tradingService = {
  create(payload: CreatePaperTradePayload): Promise<PaperTradeView> {
    return apiFetch<PaperTradeView>('/paper/trades', { method: 'POST', body: payload })
  },

  active(signal?: AbortSignal): Promise<PaperTradeView[]> {
    return apiFetch<PaperTradeView[]>('/paper/trades/active', { signal })
  },

  history(
    params: TradeHistoryParams = {},
    signal?: AbortSignal,
  ): Promise<PaperTradeView[]> {
    const query = new URLSearchParams()
    if (params.limit !== undefined) query.set('limit', String(params.limit))
    if (params.offset !== undefined) query.set('offset', String(params.offset))
    if (params.status) query.set('status', params.status)
    if (params.side) query.set('side', params.side)
    if (params.instrument) query.set('instrument', params.instrument)
    if (params.dateFrom) query.set('dateFrom', params.dateFrom)
    if (params.dateTo) query.set('dateTo', params.dateTo)
    const suffix = query.toString() ? `?${query.toString()}` : ''
    return apiFetch<PaperTradeView[]>(`/paper/trades/history${suffix}`, { signal })
  },

  getById(id: string, signal?: AbortSignal): Promise<PaperTradeView> {
    return apiFetch<PaperTradeView>(`/paper/trades/${id}`, { signal })
  },

  exit(id: string): Promise<PaperTradeView> {
    return apiFetch<PaperTradeView>(`/paper/trades/${id}/exit`, { method: 'POST' })
  },

  cancel(id: string): Promise<PaperTradeView> {
    return apiFetch<PaperTradeView>(`/paper/trades/${id}/cancel`, { method: 'POST' })
  },

  positions(signal?: AbortSignal): Promise<PaperTradeView[]> {
    return apiFetch<PaperTradeView[]>('/paper/positions', { signal })
  },

  orders(signal?: AbortSignal): Promise<QueueItemSnapshot[]> {
    return apiFetch<QueueItemSnapshot[]>('/paper/orders', { signal })
  },
}
