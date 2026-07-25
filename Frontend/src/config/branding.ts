/**
 * Single source of truth for product identity. Every page title, meta
 * description, nav label, footer, and structured-data block reads from here
 * instead of hardcoding the name — renaming or repositioning the product
 * later means editing this file only.
 */
export const branding = {
  name: 'Vertrade',
  legalName: 'Vertrade',
  tagline: 'Practice trading. Master the markets.',
  shortDescription:
    'Vertrade is a free paper trading simulator for stocks and options — practice with virtual money and realistic order, risk, and P&L mechanics.',
  longDescription:
    'Vertrade lets you practice trading stocks and options with a virtual balance, real order and risk-management mechanics, stop-loss and target management, and full trade history — with zero real-money risk.',
  domain: 'vertrade.app',
  url: 'https://vertrade.app',
  supportEmail: 'support@vertrade.app',
  twitterHandle: '@vertradeapp',
  socialImage: '/og-image.png',
  keywords: [
    'free paper trading',
    'paper trading simulator',
    'stock market simulator',
    'options trading simulator',
    'virtual trading',
    'practice trading online',
    'free trading simulator',
  ],
} as const

export type Branding = typeof branding
