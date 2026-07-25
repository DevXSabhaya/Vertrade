import { useCallback, useRef, useSyncExternalStore } from 'react'
import { getSocket } from '@/lib/socket-client'

export interface PricePoint {
  readonly price: number
  readonly timestamp: string
}

interface StreamState {
  readonly latest: PricePoint | null
  readonly history: readonly PricePoint[]
  readonly isConnected: boolean
}

interface InstrumentRef {
  readonly instrumentToken: string
  readonly exchange: string
  readonly tradingSymbol: string
}

const EMPTY_STATE: StreamState = { latest: null, history: [], isConnected: false }
const MAX_HISTORY_POINTS = 120

/**
 * Consumes the backend's real `/realtime` price channel — never a
 * client-side fake price engine. Built on `useSyncExternalStore`, React's
 * dedicated primitive for subscribing to an external system (the socket),
 * rather than an effect that fabricates local state from it. Joins
 * `instrument:<token>` while subscribed, leaves it on unmount/instrument
 * change. `instrument` is `null` while nothing has been resolved yet (e.g.
 * the trading-call input is still empty), in which case this never
 * subscribes to anything.
 */
export function useInstrumentPriceStream(instrument: InstrumentRef | null): StreamState {
  const stateRef = useRef<StreamState>(EMPTY_STATE)

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      stateRef.current = EMPTY_STATE;
      if (!instrument) return () => {}

      const socket = getSocket()

      function handleConnect() {
        stateRef.current = { ...stateRef.current, isConnected: true }
        socket.emit('subscribe:instrument', instrument)
        onStoreChange()
      }
      function handleDisconnect() {
        stateRef.current = { ...stateRef.current, isConnected: false }
        onStoreChange()
      }
      function handlePrice(payload: { instrumentToken: string; price: number; timestamp: string }) {
        if (!instrument || payload.instrumentToken !== instrument.instrumentToken) return
        const point: PricePoint = { price: payload.price, timestamp: payload.timestamp }
        const nextHistory = [...stateRef.current.history, point].slice(-MAX_HISTORY_POINTS)
        stateRef.current = { latest: point, history: nextHistory, isConnected: stateRef.current.isConnected }
        onStoreChange()
      }

      socket.on('connect', handleConnect)
      socket.on('disconnect', handleDisconnect)
      socket.on('price', handlePrice)
      stateRef.current = { ...stateRef.current, isConnected: socket.connected }
      if (socket.connected) {
        socket.emit('subscribe:instrument', instrument)
      }
      onStoreChange()

      return () => {
        socket.emit('unsubscribe:instrument', { instrumentToken: instrument.instrumentToken })
        socket.off('connect', handleConnect)
        socket.off('disconnect', handleDisconnect)
        socket.off('price', handlePrice)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `instrument` is compared by its primitive fields, not by identity, since callers may pass a fresh object literal each render
    [instrument?.instrumentToken, instrument?.exchange, instrument?.tradingSymbol],
  )

  const getSnapshot = useCallback(() => stateRef.current, [])

  return useSyncExternalStore(subscribe, getSnapshot)
}
