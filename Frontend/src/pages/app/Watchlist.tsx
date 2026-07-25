import { Link } from 'react-router-dom'
import { Seo } from '@/components/seo/Seo'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'

/**
 * There is no instrument-search/watchlist backend endpoint yet — this page
 * is an honest, clearly-labeled integration boundary rather than a fake
 * interactive watchlist backed by nothing. Wire it up once an instrument
 * list/search API exists on the backend.
 */
export default function Watchlist() {
  return (
    <>
      <Seo title="Watchlist" description="Track instruments you're watching." path="/app/watchlist" noIndex />
      <h1 className="text-2xl font-bold text-ink-900">Watchlist</h1>

      <div className="mt-6">
        <EmptyState
          title="Watchlists aren't connected yet"
          description="This screen is reserved for a future instrument-search and watchlist API. For now, you can search for an instrument directly when placing a new paper trade."
          action={
            <Link to="/app/trade">
              <Button size="sm" variant="secondary">
                Go to New Trade
              </Button>
            </Link>
          }
        />
      </div>
    </>
  )
}
