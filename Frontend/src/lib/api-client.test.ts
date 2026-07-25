import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from './api-client'
import { ApiError } from '@/types/api'
import { setToken, setUnauthorizedHandler } from './token-store'

describe('apiFetch', () => {
  beforeEach(() => {
    setToken(null)
    setUnauthorizedHandler(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns parsed JSON on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )

    const result = await apiFetch<{ ok: boolean }>('/ping')
    expect(result).toEqual({ ok: true })
  })

  it('attaches the bearer token when one is set', async () => {
    setToken('test-token')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('/secure')

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token')
  })

  it('throws a typed ApiError with the backend error shape on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            statusCode: 422,
            timestamp: '2026-01-01T00:00:00.000Z',
            path: '/paper/trades',
            message: 'Insufficient available balance',
            code: 'INSUFFICIENT_PAPER_BALANCE',
          }),
          { status: 422, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )

    await expect(apiFetch('/paper/trades', { method: 'POST' })).rejects.toMatchObject({
      statusCode: 422,
      code: 'INSUFFICIENT_PAPER_BALANCE',
      message: 'Insufficient available balance',
    })
  })

  it('calls the unauthorized handler on a 401 response', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            statusCode: 401,
            timestamp: '2026-01-01T00:00:00.000Z',
            path: '/account',
            message: 'Invalid or expired token',
          }),
          { status: 401, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )

    await expect(apiFetch('/account')).rejects.toBeInstanceOf(ApiError)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not call the unauthorized handler for anonymous requests', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            statusCode: 401,
            timestamp: '2026-01-01T00:00:00.000Z',
            path: '/auth/login',
            message: 'Invalid email or password',
          }),
          { status: 401, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )

    await expect(apiFetch('/auth/login', { anonymous: true })).rejects.toBeInstanceOf(ApiError)
    expect(handler).not.toHaveBeenCalled()
  })

  it('wraps a network failure in a typed ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(apiFetch('/account')).rejects.toBeInstanceOf(ApiError)
  })
})
