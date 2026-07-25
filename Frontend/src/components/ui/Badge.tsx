import type { ReactNode } from 'react'

type Tone = 'neutral' | 'gain' | 'loss' | 'brand' | 'warning'

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-700',
  gain: 'bg-gain-50 text-gain-600',
  loss: 'bg-loss-50 text-loss-600',
  brand: 'bg-brand-50 text-brand-700',
  warning: 'bg-amber-50 text-amber-700',
}

export function Badge({ tone = 'neutral', children }: { readonly tone?: Tone; readonly children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${toneClasses[tone]}`}
    >
      {children}
    </span>
  )
}
