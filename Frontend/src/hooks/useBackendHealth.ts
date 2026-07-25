import { useQuery } from '@tanstack/react-query'
import { healthService } from '@/services/health.service'

/** Polled independently of business data so the connection indicator stays accurate even if every other query on the page is failing for a different reason. */
export function useBackendHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => healthService.check(signal),
    refetchInterval: 30_000,
    retry: 1,
  })
}
