import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/types/api'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: (failureCount, error) => {
        // Retrying an auth failure or a client-error response (4xx) can
        // never succeed without the user/state changing first — only retry
        // transient/network-ish failures, and only a couple of times.
        if (error instanceof ApiError && error.statusCode < 500 && error.statusCode !== 0) {
          return false
        }
        return failureCount < 2
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
})
