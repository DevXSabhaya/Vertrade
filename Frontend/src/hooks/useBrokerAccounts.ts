import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { brokerService } from '@/services/broker.service'
import type { AddBrokerAccountRequest } from '@/types/broker'

const ACCOUNTS_KEY = ['broker-accounts'] as const
const BROKERS_KEY = ['brokers'] as const

/** The static broker catalog rarely changes — cached generously, refetched in the background. */
export function useBrokers() {
  return useQuery({
    queryKey: BROKERS_KEY,
    queryFn: ({ signal }) => brokerService.listBrokers(signal),
    staleTime: 5 * 60_000,
  })
}

/** A saved account's runtime status can change from outside this tab (session expiry, disconnect) — refetched periodically like trading-mode/broker-status. */
export function useBrokerAccounts() {
  return useQuery({
    queryKey: ACCOUNTS_KEY,
    queryFn: ({ signal }) => brokerService.listAccounts(signal),
    staleTime: 15_000,
    refetchInterval: 15_000,
  })
}

function invalidateAccounts(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY })
  // Broker connectivity affects the existing single-session indicators too.
  void queryClient.invalidateQueries({ queryKey: ['config'] })
}

export function useAddBrokerAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: AddBrokerAccountRequest) => brokerService.addAccount(body),
    onSuccess: () => invalidateAccounts(queryClient),
  })
}

export function useActivateBrokerAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (accountId: string) => brokerService.activate(accountId),
    onSuccess: () => invalidateAccounts(queryClient),
  })
}

export function useReconnectBrokerAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (accountId: string) => brokerService.reconnect(accountId),
    onSuccess: () => invalidateAccounts(queryClient),
  })
}

export function useDisconnectBrokerAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (accountId: string) => brokerService.disconnect(accountId),
    onSuccess: () => invalidateAccounts(queryClient),
  })
}

export function useRemoveBrokerAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (accountId: string) => brokerService.remove(accountId),
    onSuccess: () => invalidateAccounts(queryClient),
  })
}
