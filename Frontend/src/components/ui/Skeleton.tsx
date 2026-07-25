export function Skeleton({ className = '' }: { readonly className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-ink-200 ${className}`}
      aria-hidden="true"
    />
  )
}

export function SkeletonRows({ rows = 3 }: { readonly rows?: number }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  )
}
