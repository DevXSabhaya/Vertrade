import { apiFetch } from '@/lib/api-client'

export interface HealthStatus {
  readonly status: string
  readonly database: string
  readonly timestamp: string
}

export const healthService = {
  check(signal?: AbortSignal): Promise<HealthStatus> {
    return apiFetch<HealthStatus>('/health', { signal })
  },
}
