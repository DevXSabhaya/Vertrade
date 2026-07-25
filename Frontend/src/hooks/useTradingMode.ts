import { useQuery } from '@tanstack/react-query'
import { configService } from '@/services/config.service'

/** The mode is a deployment-wide, boot-time decision (never per-request) — safe to cache generously since it cannot change without a server restart. */
export function useTradingMode() {
  return useQuery({
    queryKey: ['config', 'trading-mode'],
    queryFn: ({ signal }) => configService.tradingMode(signal),
    staleTime: 5 * 60_000,
  })
}
