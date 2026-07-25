import { Link } from 'react-router-dom'
import { Seo } from '@/components/seo/Seo'
import { Container } from '@/components/marketing/Container'
import { Button } from '@/components/ui/Button'

export default function NotFound() {
  return (
    <>
      <Seo title="Page Not Found" description="The page you're looking for doesn't exist." path="/404" noIndex />
      <Container className="flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
        <h1 className="text-4xl font-extrabold text-ink-900">404</h1>
        <p className="mt-3 text-ink-600">We couldn't find the page you were looking for.</p>
        <Link to="/" className="mt-6">
          <Button>Back to home</Button>
        </Link>
      </Container>
    </>
  )
}
