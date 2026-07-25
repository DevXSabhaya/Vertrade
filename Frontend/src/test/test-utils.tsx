import type { ReactElement, ReactNode } from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { AuthProvider } from '@/store/auth-context'
import { ToastProvider } from '@/components/ui/Toast'

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

interface RenderOptions {
  readonly initialEntries?: string[]
  readonly queryClient?: QueryClient
}

export function renderWithProviders(ui: ReactElement, options: RenderOptions = {}) {
  const queryClient = options.queryClient ?? createTestQueryClient()

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={options.initialEntries ?? ['/']}>
            <AuthProvider>
              <ToastProvider>{children}</ToastProvider>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </HelmetProvider>
    )
  }

  return render(ui, { wrapper: Wrapper })
}
