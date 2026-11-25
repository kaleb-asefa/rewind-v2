import { Link } from 'react-router'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 px-6 pt-24 text-center">
      <p className="font-mono text-label-bold text-primary">404</p>
      <h1 className="text-headline-md">Nothing recorded on this track</h1>
      <Link to="/" className="btn-pill rounded-full bg-primary px-6 py-3 text-on-primary">
        Back home
      </Link>
    </main>
  )
}
