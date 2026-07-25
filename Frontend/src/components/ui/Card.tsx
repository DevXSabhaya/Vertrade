import type { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  readonly children: ReactNode
}

export function Card({ children, className = '', ...rest }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-ink-200 bg-white p-5 shadow-sm ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}

export function CardHeading({ children }: { readonly children: ReactNode }) {
  return <h3 className="text-sm font-semibold text-ink-500 uppercase tracking-wide">{children}</h3>
}
