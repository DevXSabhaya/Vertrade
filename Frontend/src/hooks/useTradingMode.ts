import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { configService } from '@/services/config.service'
import type { TradingMode } from '@/types/config'

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
 * Switches the caller's own trading mode. Switching to LIVE requires
 * `brokerAccountId` — the caller's own saved broker account to trade
 * through; the backend rejects the switch (with a specific reason) if the
 * caller owns no broker accounts or the selected one fails real
 * authentication.
 */
export function useSetTradingMode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: { mode: TradingMode; brokerAccountId?: string }) =>
      configService.setTradingMode(params),
    onSuccess: (data) => {
      queryClient.setQueryData(['config', 'trading-mode'], data)
      invalidateAllQueries(queryClient)
    },
  })
}

/** "Change Broker" — stays in LIVE, switches which of the caller's own accounts executes their trades. */
export function useSelectBroker() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (brokerAccountId: string) =>
      configService.selectBroker({ brokerAccountId }),
    onSuccess: (data) => {
      queryClient.setQueryData(['config', 'trading-mode'], data)
      invalidateAllQueries(queryClient)
    },
  })
}
