import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { accountService } from '@/services/account.service'

export const accountKeys = {
  summary: ['account', 'summary'] as const,
  pnl: ['account', 'pnl'] as const,
}

export function useAccountSummary() {
  return useQuery({
    queryKey: accountKeys.summary,
    queryFn: ({ signal }) => accountService.summary(signal),
  })
}

export function usePnlSummary() {
  return useQuery({
    queryKey: accountKeys.pnl,
    queryFn: ({ signal }) => accountService.pnl(signal),
    refetchInterval: 15_000,
  })
}

export function useResetPaperBalance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => accountService.resetBalance(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['account'] })
      void queryClient.invalidateQueries({ queryKey: ['trades'] })
    },
  })
}
