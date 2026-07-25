import { formatCurrency } from '@/lib/format'

interface TargetProgressProps {
  readonly targets: readonly number[]
  readonly currentTarget: number | null
}

/** Shows every configured target as a small step indicator — filled steps are targets already passed/hit. */
export function TargetProgress({ targets, currentTarget }: TargetProgressProps) {
  if (targets.length === 0) {
    return <span className="text-xs text-ink-400">No targets</span>
  }

  const currentIndex = currentTarget !== null ? targets.indexOf(currentTarget) : -1

  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label="Targets">
      {targets.map((target, index) => {
        const isHit = currentIndex >= 0 && index < currentIndex
        const isCurrent = index === currentIndex
        return (
          <li key={`${target}-${index}`} className="flex items-center gap-1">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                isHit
                  ? 'bg-gain-50 text-gain-600'
                  : isCurrent
                    ? 'bg-brand-50 text-brand-700'
                    : 'bg-ink-100 text-ink-500'
              }`}
              aria-current={isCurrent ? 'step' : undefined}
            >
              T{index + 1}: {formatCurrency(target)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
