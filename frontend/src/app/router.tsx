import { createBrowserRouter } from 'react-router'

import { Layout } from './Layout'
import { RouteError } from './RouteError'

/** Each page is its own chunk, so the landing page doesn't ship the charts. */
export const router = createBrowserRouter([
  {
    element: <Layout />,
    errorElement: <RouteError />,
    children: [
      { index: true, lazy: () => import('@/features/landing/LandingPage').then(page) },
      { path: 'upload', lazy: () => import('@/features/upload/UploadPage').then(page) },
      { path: 'overview', lazy: () => import('@/features/overview/OverviewPage').then(page) },
      { path: 'charts', lazy: () => import('@/features/charts/ChartsPage').then(page) },
      { path: 'explore', lazy: () => import('@/features/explore/ExplorePage').then(page) },
      { path: '*', lazy: () => import('./NotFound').then(page) },
    ],
  },
])

function page(mod: { default: React.ComponentType }) {
  return { Component: mod.default }
}
