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

/**
 * Unlike trading mode, broker connect/auth state can genuinely change while
 * the app is open (session refresh, broker-side disconnect) — refetched
 * periodically rather than cached indefinitely.
 */
export function useBrokerStatus() {
  return useQuery({
    queryKey: ['config', 'broker-status'],
    queryFn: ({ signal }) => configService.brokerStatus(signal),
    staleTime: 30_000,
    refetchInterval: 30_000,
  })
}

/** No broker account to summarize in PAPER mode — the backend already reflects that via `supported: false` rather than this hook special-casing it. */
export function useBrokerAccountSummary() {
  return useQuery({
    queryKey: ['config', 'broker-account-summary'],
    queryFn: ({ signal }) => configService.brokerAccountSummary(signal),
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

export function useConnectBroker() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => configService.connectBroker(),
    onSuccess: () => invalidateAllQueries(queryClient),
  })
}

export function useDisconnectBroker() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => configService.disconnectBroker(),
    onSuccess: () => invalidateAllQueries(queryClient),
  })
}

export function useReconnectBroker() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (accessToken: string) => configService.reconnectBroker(accessToken),
    onSuccess: () => invalidateAllQueries(queryClient),
  })
}
