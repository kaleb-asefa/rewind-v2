import { Link, isRouteErrorResponse, useRouteError } from 'react-router'

export function RouteError() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Something went wrong.'
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 px-6 pt-24 text-center">
      <h1 className="text-headline-md">This page hit a snag</h1>
      <p className="text-body-sm text-on-surface-variant">{message}</p>
      <Link to="/" className="btn-pill rounded-full bg-primary px-6 py-3 text-on-primary">
        Back home
      </Link>
    </main>
  )
}
