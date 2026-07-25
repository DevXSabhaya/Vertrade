const STORAGE_KEY = 'vertrade.accessToken'

let currentToken: string | null = localStorage.getItem(STORAGE_KEY)
let onUnauthorized: (() => void) | null = null

/** Read synchronously by the API client on every request — avoids a React re-render round trip just to attach a header. */
export function getToken(): string | null {
  return currentToken
}

export function setToken(token: string | null): void {
  currentToken = token
  if (token) {
    localStorage.setItem(STORAGE_KEY, token)
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
}

/** Registered once by AuthProvider — lets the API client react to a 401 (expired/invalid token) without importing React state directly. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler
}

export function notifyUnauthorized(): void {
  onUnauthorized?.()
}
