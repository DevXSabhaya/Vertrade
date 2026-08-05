import { apiFetch } from '@/lib/api-client'
import type { AddBrokerAccountRequest, BrokerAccount, BrokerMetadata } from '@/types/broker'

export const brokerService = {
  listBrokers(signal?: AbortSignal): Promise<BrokerMetadata[]> {
    return apiFetch<BrokerMetadata[]>('/brokers', { signal })
  },

  listAccounts(signal?: AbortSignal): Promise<BrokerAccount[]> {
    return apiFetch<BrokerAccount[]>('/broker-accounts', { signal })
  },

  addAccount(body: AddBrokerAccountRequest): Promise<BrokerAccount> {
    return apiFetch<BrokerAccount>('/broker-accounts', { method: 'POST', body })
  },

  activate(accountId: string): Promise<BrokerAccount> {
    return apiFetch<BrokerAccount>(`/broker-accounts/${accountId}/activate`, { method: 'POST' })
  },

  reconnect(accountId: string): Promise<BrokerAccount> {
    return apiFetch<BrokerAccount>(`/broker-accounts/${accountId}/reconnect`, { method: 'POST' })
  },

  disconnect(accountId: string): Promise<BrokerAccount> {
    return apiFetch<BrokerAccount>(`/broker-accounts/${accountId}/disconnect`, { method: 'POST' })
  },

  remove(accountId: string): Promise<{ removed: true }> {
    return apiFetch<{ removed: true }>(`/broker-accounts/${accountId}`, { method: 'DELETE' })
  },
}
