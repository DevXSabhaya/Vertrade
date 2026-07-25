import { useQuery } from '@tanstack/react-query'
import { riskService } from '@/services/risk.service'

export const riskKeys = {
  status: ['risk', 'status'] as const,
  snapshot: ['risk', 'snapshot'] as const,
}

export function useRiskStatus() {
  return useQuery({
    queryKey: riskKeys.status,
    queryFn: ({ signal }) => riskService.status(signal),
    refetchInterval: 20_000,
  })
}

export function useRiskSnapshot() {
  return useQuery({
    queryKey: riskKeys.snapshot,
    queryFn: ({ signal }) => riskService.snapshot(signal),
    refetchInterval: 20_000,
  })
}
