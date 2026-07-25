import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from 'react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  readonly label: string
  readonly error?: string
  readonly children: ReactNode
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, id, className = '', children, ...rest },
  ref,
) {
  const generatedId = useId()
  const selectId = id ?? generatedId
  const errorId = `${selectId}-error`

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className="text-sm font-medium text-ink-700">
        {label}
      </label>
      <select
        ref={ref}
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-ink-900 outline-none transition-colors focus-visible:border-brand-500 ${
          error ? 'border-loss-500' : 'border-ink-300'
        } ${className}`}
        {...rest}
      >
        {children}
      </select>
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-loss-600">
          {error}
        </p>
      )}
    </div>
  )
})
