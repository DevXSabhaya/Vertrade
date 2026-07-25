import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/test-utils'
import Home from './Home'

describe('Home page', () => {
  it('renders the hero heading and both primary CTAs', () => {
    renderWithProviders(<Home />, { initialEntries: ['/'] })

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Start Paper Trading Free/i }).length).toBeGreaterThan(0)
    expect(
      screen.getAllByRole('link', { name: /Learn How Paper Trading Works/i }).length,
    ).toBeGreaterThan(0)
  })
})
