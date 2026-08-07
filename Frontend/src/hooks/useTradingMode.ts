import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { configService } from '@/services/config.service'
import type { TradingMode } from '@/types/config'

/**
 * The mode is deployment-wide (never per-request/per-user) but, unlike
 * before, it can now be switched at runtime via `useSetTradingMode` — so
 * this is refetched periodically rather than cached indefinitely, same as
 * broker status.
 */
export function useTradingMode() {
  return useQuery({
    queryKey: ['config', 'trading-mode'],
    queryFn: ({ signal }) => configService.tradingMode(signal),
    staleTime: 30_000,
    refetchInterval: 30_000,
  })
}

function invalidateAllQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['config'] })
  void queryClient.invalidateQueries({ queryKey: ['trades'] })
  void queryClient.invalidateQueries({ queryKey: ['account'] })
  void queryClient.invalidateQueries({ queryKey: ['risk'] })
}

/**
 * Switches the deployment's persisted trading mode. Every safety check
 * (LIVE readiness, broker credentials, live session) lives server-side in
 * `TradingModeService.setMode` — a rejection here means the switch simply
 * did not happen (no silent fallback), so callers should surface the
 * thrown error rather than assume success.
 */
export function useSetTradingMode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (mode: TradingMode) => configService.setTradingMode({ mode }),
    onSuccess: (data) => {
      queryClient.setQueryData(['config', 'trading-mode'], data)
      invalidateAllQueries(queryClient)
    },
  })
}

