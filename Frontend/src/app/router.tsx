/* eslint-disable react-refresh/only-export-components -- this is a route-config module, not a component that gets hot-reloaded during editing. */
import { lazy } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { PublicLayout } from '@/layouts/PublicLayout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { withSuspense } from '@/app/AppFallback'

// Public pages ship in the main bundle (they're the SEO/first-load surface).
import Home from '@/pages/public/Home'
import PaperTrading from '@/pages/public/PaperTrading'
import PaperTradingSimulator from '@/pages/public/PaperTradingSimulator'
import StockMarketSimulator from '@/pages/public/StockMarketSimulator'
import VirtualTrading from '@/pages/public/VirtualTrading'
import OptionsPaperTrading from '@/pages/public/OptionsPaperTrading'
import HowPaperTradingWorks from '@/pages/public/HowPaperTradingWorks'
import Learn from '@/pages/public/Learn'
import Pricing from '@/pages/public/Pricing'
import About from '@/pages/public/About'
import Contact from '@/pages/public/Contact'
import PrivacyPolicy from '@/pages/public/PrivacyPolicy'
import Terms from '@/pages/public/Terms'
import Disclaimer from '@/pages/public/Disclaimer'
import NotFound from '@/pages/public/NotFound'
import Login from '@/pages/auth/Login'
import Register from '@/pages/auth/Register'
import ForgotPassword from '@/pages/auth/ForgotPassword'
import ResetPassword from '@/pages/auth/ResetPassword'

// Authenticated app pages are lazy-loaded — a first-time visitor reading the
// landing page never downloads the trading dashboard's code.
const AppLayout = lazy(() => import('@/layouts/AppLayout').then((m) => ({ default: m.AppLayout })))
const Dashboard = lazy(() => import('@/pages/app/Dashboard'))
const NewTrade = lazy(() => import('@/pages/app/NewTrade'))
const ActiveTrades = lazy(() => import('@/pages/app/ActiveTrades'))
const Positions = lazy(() => import('@/pages/app/Positions'))
const Orders = lazy(() => import('@/pages/app/Orders'))
const History = lazy(() => import('@/pages/app/History'))
const Account = lazy(() => import('@/pages/app/Account'))
const Watchlist = lazy(() => import('@/pages/app/Watchlist'))
const RiskStatus = lazy(() => import('@/pages/app/RiskStatus'))
const BrokerManager = lazy(() => import('@/pages/app/BrokerManager'))

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/paper-trading', element: <PaperTrading /> },
      { path: '/paper-trading-simulator', element: <PaperTradingSimulator /> },
      { path: '/stock-market-simulator', element: <StockMarketSimulator /> },
      { path: '/virtual-trading', element: <VirtualTrading /> },
      { path: '/options-paper-trading', element: <OptionsPaperTrading /> },
      { path: '/how-paper-trading-works', element: <HowPaperTradingWorks /> },
      { path: '/learn', element: <Learn /> },
      { path: '/pricing', element: <Pricing /> },
      { path: '/about', element: <About /> },
      { path: '/contact', element: <Contact /> },
      { path: '/privacy-policy', element: <PrivacyPolicy /> },
      { path: '/terms', element: <Terms /> },
      { path: '/disclaimer', element: <Disclaimer /> },
      { path: '/login', element: <Login /> },
      { path: '/register', element: <Register /> },
      { path: '/forgot-password', element: <ForgotPassword /> },
      { path: '/reset-password', element: <ResetPassword /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/app',
        element: withSuspense(<AppLayout />),
        children: [
          { index: true, element: withSuspense(<Dashboard />) },
          { path: 'trade', element: withSuspense(<NewTrade />) },
          { path: 'active-trades', element: withSuspense(<ActiveTrades />) },
          { path: 'positions', element: withSuspense(<Positions />) },
          { path: 'orders', element: withSuspense(<Orders />) },
          { path: 'history', element: withSuspense(<History />) },
          { path: 'watchlist', element: withSuspense(<Watchlist />) },
          { path: 'risk', element: withSuspense(<RiskStatus />) },
          { path: 'brokers', element: withSuspense(<BrokerManager />) },
          { path: 'settings', element: withSuspense(<Account />) },
          { path: 'account', element: withSuspense(<Account />) },
        ],
      },
    ],
  },
])
