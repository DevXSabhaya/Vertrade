/* eslint-disable react-refresh/only-export-components -- the Provider + its `useAuth` hook are one cohesive context module by design; splitting the hook into its own file would only add indirection. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { authService } from '@/services/auth.service'
import { getToken, setToken, setUnauthorizedHandler } from '@/lib/token-store'
import { disconnectSocket } from '@/lib/socket-client'
import type { LoginPayload, PublicUser, RegisterPayload } from '@/types/auth'

interface AuthContextValue {
  readonly user: PublicUser | null
  /** True only while the very first session check (on app load) is in flight — never true again after that, even during login/register. */
  readonly isInitializing: boolean
  readonly isAuthenticated: boolean
  login(payload: LoginPayload): Promise<void>
  register(payload: RegisterPayload): Promise<void>
  logout(): void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const queryClient = useQueryClient()

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    queryClient.clear()
    disconnectSocket()
  }, [queryClient])

  useEffect(() => {
    setUnauthorizedHandler(logout)
    return () => setUnauthorizedHandler(null)
  }, [logout])

  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      if (!getToken()) {
        setIsInitializing(false)
        return
      }
      try {
        const current = await authService.me()
        if (!cancelled) setUser(current)
      } catch {
        // A 401 already triggers logout() via notifyUnauthorized(); a
        // network error just leaves the user logged out until reload.
      } finally {
        if (!cancelled) setIsInitializing(false)
      }
    }
    void hydrate()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (payload: LoginPayload) => {
    const result = await authService.login(payload)
    setToken(result.accessToken)
    setUser(result.user)
  }, [])

  const register = useCallback(async (payload: RegisterPayload) => {
    const result = await authService.register(payload)
    setToken(result.accessToken)
    setUser(result.user)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isInitializing,
      isAuthenticated: user !== null,
      login,
      register,
      logout,
    }),
    [user, isInitializing, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
