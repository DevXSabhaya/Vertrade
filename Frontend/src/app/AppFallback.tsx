/* eslint-disable react-refresh/only-export-components -- `withSuspense` is a routing helper, not something edited during a hot-reload session. */
import { Suspense, type ReactNode } from 'react'
import { SkeletonRows } from '@/components/ui/Skeleton'

export function AppFallback() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <SkeletonRows rows={4} />
    </div>
  )
}

export function withSuspense(node: ReactNode) {
  return <Suspense fallback={<AppFallback />}>{node}</Suspense>
}
