import { Button } from './Button'

interface ErrorStateProps {
  readonly message?: string
  readonly onRetry?: () => void
}

export function ErrorState({ message = 'Something went wrong.', onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-xl border border-loss-500/30 bg-loss-50 p-8 text-center"
    >
      <p className="text-sm font-medium text-loss-600">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}
