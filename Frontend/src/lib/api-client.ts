import { ApiError, type ApiErrorBody } from '@/types/api'
import { getToken, notifyUnauthorized } from './token-store'

export const BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'
).replace(/\/$/, '')

export interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  readonly body?: unknown
  readonly signal?: AbortSignal
  /** Skip the Authorization header for this call (e.g. register/login themselves). */
  readonly anonymous?: boolean
}

/**
 * The single entrypoint every request to the backend goes through — no
 * component/hook ever calls `fetch` directly. Attaches the bearer token,
 * parses the backend's real error shape into a typed `ApiError`, and routes
 * every 401 through one place so an expired/invalid session is handled
 * consistently everywhere instead of ad hoc per screen.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  const token = getToken()
  if (token && !options.anonymous) {
    headers.Authorization = `Bearer ${token}`
  }

  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw cause
    }
    throw new ApiError({
      statusCode: 0,
      timestamp: new Date().toISOString(),
      path,
      message: 'Unable to reach the server. Check your connection and try again.',
    })
  }

  if (response.status === 204) {
    return undefined as T
  }

  const contentType = response.headers.get('content-type') ?? ''
  const payload: unknown = contentType.includes('application/json')
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    const body: ApiErrorBody =
      typeof payload === 'object' && payload !== null && 'statusCode' in payload
        ? (payload as ApiErrorBody)
        : {
            statusCode: response.status,
            timestamp: new Date().toISOString(),
            path,
            message:
              typeof payload === 'string' && payload.length > 0
                ? payload
                : 'Something went wrong. Please try again.',
          }

    const error = new ApiError(body)
    if (error.isUnauthorized && !options.anonymous) {
      notifyUnauthorized()
    }
    throw error
  }

  return payload as T
}
