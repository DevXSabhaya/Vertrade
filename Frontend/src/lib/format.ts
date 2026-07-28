const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
})

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value)
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

/** Time-only, seconds included — for a "last updated" indicator next to a live-updating value, where the date is redundant and the extra precision (vs formatDateTime's minute-level timeStyle) matters. */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function formatPnlClass(value: number): string {
  if (value > 0) return 'text-gain-600'
  if (value < 0) return 'text-loss-600'
  return 'text-ink-500'
}

export function signedCurrency(value: number): string {
  const formatted = formatCurrency(Math.abs(value))
  if (value > 0) return `+${formatted}`
  if (value < 0) return `-${formatted}`
  return formatted
}
