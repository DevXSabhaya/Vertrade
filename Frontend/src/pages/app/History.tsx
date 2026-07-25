import { useEffect, useState } from 'react'
import { Seo } from '@/components/seo/Seo'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Table, TableHead, Th, TableBody, Td } from '@/components/ui/Table'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import { useTradeHistory } from '@/hooks/useTrades'
import { TradeStatusBadge, DirectionBadge } from '@/features/trading/StatusBadge'
import { formatCurrency, formatDateTime, formatPnlClass, signedCurrency } from '@/lib/format'
import type { PaperTradeStatus } from '@/types/trading'

const PAGE_SIZE = 20
/** Debounces the free-text symbol filter so every keystroke doesn't trigger a fresh request. */
const SEARCH_DEBOUNCE_MS = 300

export default function History() {
  const [offset, setOffset] = useState(0)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<PaperTradeStatus | 'ALL'>('ALL')

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [search])

  // Reset to the first page whenever a filter changes — a stale offset from
  // a previous filter could otherwise point past the end of the new,
  // narrower result set.
  useEffect(() => {
    setOffset(0)
  }, [debouncedSearch, statusFilter])

  // Filtering happens server-side now (via /paper/trades/history's
  // status/instrument query params) rather than client-side on top of an
  // already-paginated page — filtering only the current page client-side
  // meant a match outside that page was simply invisible, with no way to
  // reach it via Previous/Next.
  const history = useTradeHistory({
    limit: PAGE_SIZE,
    offset,
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    instrument: debouncedSearch || undefined,
  })
  const filtered = history.data ?? []

  return (
    <>
      <Seo title="Trade History" description="Your closed paper trade history." path="/app/history" noIndex />
      <h1 className="text-2xl font-bold text-ink-900">Trade History</h1>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="w-full sm:max-w-xs">
          <Input
            label="Search symbol"
            placeholder="e.g. RELIANCE"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="w-full sm:max-w-xs">
          <Select
            label="Status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as PaperTradeStatus | 'ALL')}
          >
            <option value="ALL">All statuses</option>
            <option value="CLOSED">Closed</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
        </div>
      </div>

      <div className="mt-6">
        {history.isLoading ? (
          <SkeletonRows rows={5} />
        ) : history.isError ? (
          <ErrorState message="Couldn't load trade history." onRetry={() => history.refetch()} />
        ) : filtered.length > 0 ? (
          <>
            <Table caption="Closed paper trades">
              <TableHead>
                <Th>Symbol</Th>
                <Th>Direction</Th>
                <Th>Entry</Th>
                <Th>Exit</Th>
                <Th>P&amp;L</Th>
                <Th>Status</Th>
                <Th>Closed</Th>
              </TableHead>
              <TableBody>
                {filtered.map((trade) => (
                  <tr key={trade.id}>
                    <Td className="font-medium text-ink-900">{trade.rawSymbol}</Td>
                    <Td>
                      <DirectionBadge direction={trade.direction} />
                    </Td>
                    <Td>{formatCurrency(trade.entryTriggerPrice)}</Td>
                    <Td>
                      {trade.trade?.exitPrice !== null && trade.trade?.exitPrice !== undefined
                        ? formatCurrency(trade.trade.exitPrice)
                        : '—'}
                    </Td>
                    <Td className={formatPnlClass(trade.trade?.realizedPnl ?? 0)}>
                      {trade.trade?.realizedPnl !== null && trade.trade?.realizedPnl !== undefined
                        ? signedCurrency(trade.trade.realizedPnl)
                        : '—'}
                    </Td>
                    <Td>
                      <TradeStatusBadge status={trade.status} />
                    </Td>
                    <Td>{formatDateTime(trade.updatedAt)}</Td>
                  </tr>
                ))}
              </TableBody>
            </Table>

            <div className="mt-4 flex items-center justify-between">
              <Button
                variant="secondary"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!history.data || history.data.length < PAGE_SIZE}
                onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
              >
                Next
              </Button>
            </div>
          </>
        ) : (
          <EmptyState
            title="No trades found"
            description={
              search || statusFilter !== 'ALL'
                ? 'Try a different search or filter.'
                : 'Your closed paper trades will appear here.'
            }
          />
        )}
      </div>
    </>
  )
}
