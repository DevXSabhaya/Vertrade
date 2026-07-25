import type { ReactNode } from 'react'

export function Table({ children, caption }: { readonly children: ReactNode; readonly caption?: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-200">
      <table className="w-full min-w-max border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  )
}

export function TableHead({ children }: { readonly children: ReactNode }) {
  return (
    <thead className="bg-ink-50 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
      <tr>{children}</tr>
    </thead>
  )
}

export function Th({ children }: { readonly children: ReactNode }) {
  return (
    <th scope="col" className="px-4 py-3 whitespace-nowrap">
      {children}
    </th>
  )
}

export function TableBody({ children }: { readonly children: ReactNode }) {
  return <tbody className="divide-y divide-ink-100">{children}</tbody>
}

export function Td({ children, className = '' }: { readonly children: ReactNode; readonly className?: string }) {
  return <td className={`px-4 py-3 whitespace-nowrap text-ink-800 ${className}`}>{children}</td>
}
