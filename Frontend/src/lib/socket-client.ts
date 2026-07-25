import { io, type Socket } from 'socket.io-client'
import { BASE_URL } from './api-client'
import { getToken } from './token-store'

let socket: Socket | null = null

/**
 * One shared connection to the backend's `/realtime` namespace, created
 * lazily on first use and re-authenticated with whatever token is current —
 * never a second, independent price/trade-event source. Callers join rooms
 * via `subscribe:instrument` / `subscribe:trade` (see `useInstrumentPriceStream`
 * / any future trade-event hook); nothing here fabricates data on its own.
 */
export function getSocket(): Socket {
  if (socket) return socket

  socket = io(`${BASE_URL}/realtime`, {
    auth: { token: getToken() },
    transports: ['websocket'],
    autoConnect: true,
  })
  return socket
}

/** Called on logout so a stale/unauthenticated connection never lingers. */
export function disconnectSocket(): void {
  socket?.disconnect()
  socket = null
}
