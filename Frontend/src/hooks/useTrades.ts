import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { tradingService, type TradeHistoryParams } from '@/services/trading.service'
import type { CreatePaperTradePayload } from '@/types/trading'

export const tradeKeys = {
  active: ['trades', 'active'] as const,
  positions: ['trades', 'positions'] as const,
  orders: ['trades', 'orders'] as const,
  history: (params: TradeHistoryParams) => ['trades', 'history', params] as const,
  detail: (id: string) => ['trades', 'detail', id] as const,
}

export function useActiveTrades() {
  return useQuery({
    queryKey: tradeKeys.active,
    queryFn: ({ signal }) => tradingService.active(signal),
    refetchInterval: 10_000,
  })
}

export function usePositions() {
  return useQuery({
    queryKey: tradeKeys.positions,
    queryFn: ({ signal }) => tradingService.positions(signal),
    refetchInterval: 10_000,
  })
}

export function useOrders() {
  return useQuery({
    queryKey: tradeKeys.orders,
    queryFn: ({ signal }) => tradingService.orders(signal),
    refetchInterval: 10_000,
  })
}

export function useTradeHistory(params: TradeHistoryParams) {
  return useQuery({
    queryKey: tradeKeys.history(params),
    queryFn: ({ signal }) => tradingService.history(params, signal),
  })
}

function invalidateTradingData(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['trades'] })
  void queryClient.invalidateQueries({ queryKey: ['account'] })
}

export function useCreateTrade() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreatePaperTradePayload) => tradingService.create(payload),
    onSuccess: () => invalidateTradingData(queryClient),
  })
}

export function useExitTrade() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => tradingService.exit(id),
    onSuccess: () => invalidateTradingData(queryClient),
  })
}

export function useCancelTrade() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => tradingService.cancel(id),
    onSuccess: () => invalidateTradingData(queryClient),
  })
}
