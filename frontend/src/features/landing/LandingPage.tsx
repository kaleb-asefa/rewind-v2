import { useRef } from 'react'
import { Link, useNavigate } from 'react-router'

import preview from '@/assets/dashboard-preview.png'
import { Icon } from '@/components/Icon'

import { CassetteDeck, type CassetteHandle } from './CassetteDeck'

const STEPS = [
  ['Open Spotify privacy settings', 'Sign in to your Spotify account page and open Privacy.'],
  ['Request your data', 'Tick "Extended streaming history" to get your full lifetime data.'],
  ['Wait for the email', 'Spotify usually takes a few days (up to 30) to prepare it.'],
  ['Upload it here', 'Unzip it and drop the Streaming_History_Audio_*.json files into Rewind.'],
] as const

const SPOTIFY_PRIVACY = 'https://www.spotify.com/account/privacy/'

export default function LandingPage() {
  const deck = useRef<CassetteHandle>(null)
  const navigate = useNavigate()

  return (
    <main>
      {/* Hero: cassette / rewind deck */}
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background pt-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'radial-gradient(circle at 50% 40%, var(--hero-glow), transparent 60%)',
          }}
        />
        <div className="relative z-10 mx-container-padding-mobile flex w-full max-w-3xl flex-col items-center p-8 text-center md:p-16">
          <h1 className="mb-4 text-display-lg-mobile leading-[1.1] tracking-tight text-on-surface md:text-display-lg">
            Your music history.
            <br />
            <span className="text-primary">Unwrapped</span>, any day.
          </h1>
          <p className="mb-10 max-w-lg text-body-lg text-on-surface-variant">
            Audio analytics for your whole streaming history.
          </p>

          <CassetteDeck ref={deck} />

          <div className="flex w-full flex-col justify-center gap-4 sm:flex-row">
            <Link
              to="/upload"
              onClick={(e) => {
                e.preventDefault()
                deck.current?.rewind(() => navigate('/upload'))
              }}
              className="btn-pill-lg flex items-center justify-center gap-3 rounded-full bg-primary px-10 py-4 text-on-primary shadow-spotify-green transition-all hover:scale-105 active:scale-95"
            >
              <Icon name="fast_rewind" filled className="text-xl" />
              Rewind Your Year
            </Link>
            <a
              href="#how-it-works"
              className="btn-pill-lg flex items-center justify-center gap-3 rounded-full border border-outline-variant/30 bg-surface-container-high px-10 py-4 text-on-surface transition-all hover:bg-surface-container"
            >
              <Icon name="help" className="text-xl" />
              How it works
            </a>
          </div>
        </div>
      </section>

      {/* Two paths */}
      <section className="mx-auto max-w-7xl px-container-padding-mobile py-section-gap md:px-container-padding-desktop">
        <div className="grid grid-cols-1 gap-gutter md:grid-cols-2">
          <PathCard
            icon="bolt"
            accent
            title="Quick Snapshot"
            body="An instant, shareable snapshot: top artist, track, album and total time."
            cta="Upload Your Data"
            ctaIcon="arrow_forward"
          />
          <PathCard
            icon="analytics"
            title="Deep Dive"
            body="Years of trends, moods and deep-dive analytics from your full export."
            cta="Upload Data"
            ctaIcon="upload_file"
          />
        </div>
      </section>

      {/* How to get the data */}
      <section
        id="how-it-works"
        className="relative scroll-mt-24 overflow-hidden bg-surface-container-low px-container-padding-mobile py-section-gap md:px-container-padding-desktop"
      >
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <h2 className="mb-6 text-display-lg-mobile text-on-surface md:text-headline-lg">
              Get your full history
            </h2>
            <p className="mb-8 max-w-xl text-body-lg text-on-surface-variant">
              Spotify Wrapped shows one year. Your <b>Extended Streaming History</b> export has
              every play since you joined — Rewind turns it into charts, trends and stories. It
              stays private to your browser session and is deleted automatically after 48 hours
              idle.
            </p>
            <a
              href={SPOTIFY_PRIVACY}
              target="_blank"
              rel="noreferrer"
              className="group flex w-fit items-center gap-2 text-sm font-bold uppercase tracking-wider text-primary transition-all hover:gap-4"
            >
              Open Spotify privacy settings
              <Icon name="open_in_new" className="transition-transform group-hover:translate-x-1" />
            </a>
          </div>
          <ol className="space-y-2 lg:col-span-6">
            {STEPS.map(([title, body], i) => (
              <li
                key={title}
                className="flex items-start gap-4 rounded p-4 transition-colors hover:bg-surface-container"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-title-md text-on-surface">{title}</h3>
                  <p className="text-body-sm text-on-surface-variant">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Preview */}
      <section className="px-container-padding-mobile py-section-gap md:px-container-padding-desktop">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-12 overflow-hidden rounded bg-surface-container-low p-8 md:p-16 lg:flex-row">
          <div className="space-y-6 lg:w-[40%]">
            <div className="inline-block rounded-full bg-primary/10 px-4 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
              Live Analytics
            </div>
            <h2 className="text-display-lg-mobile leading-tight text-on-surface md:text-headline-lg">
              See your data in a whole new light.
            </h2>
            <p className="text-body-lg text-on-surface-variant">
              Beyond lists: tempo shifts, mood trends and the songs behind your moments.
            </p>
          </div>
          <div className="group relative w-full lg:w-[60%]">
            <div className="absolute -inset-1 rounded-xl bg-primary/10 opacity-25 blur-xl transition duration-1000 group-hover:opacity-40" />
            <img
              src={preview}
              alt="The Rewind overview dashboard"
              loading="lazy"
              className="relative h-auto w-full rounded transition-transform duration-500 group-hover:scale-[1.01]"
            />
          </div>
        </div>
      </section>
    </main>
  )
}

function PathCard(props: {
  icon: string
  accent?: boolean
  title: string
  body: string
  cta: string
  ctaIcon: string
}) {
  return (
    <div className="spotify-card group rounded-lg bg-surface-container-low p-8 md:p-12">
      <div
        className={`mb-8 flex h-14 w-14 items-center justify-center rounded-full transition-transform group-hover:scale-110 ${
          props.accent ? 'bg-primary/10' : 'bg-surface-container-high'
        }`}
      >
        <Icon
          name={props.icon}
          className={`text-3xl ${props.accent ? 'text-primary' : 'text-on-surface'}`}
        />
      </div>
      <h3 className="mb-4 text-headline-lg text-on-surface">{props.title}</h3>
      <p className="mb-8 text-body-lg leading-relaxed text-on-surface-variant">{props.body}</p>
      <Link
        to="/upload"
        className={`btn-pill-lg flex w-full items-center justify-center gap-2 rounded-full py-4 transition-all hover:scale-[1.02] active:scale-[0.98] ${
          props.accent
            ? 'bg-primary text-on-primary hover:shadow-spotify-green'
            : 'border border-outline text-on-surface hover:border-on-surface'
        }`}
      >
        {props.cta}
        <Icon name={props.ctaIcon} className="text-xl" />
      </Link>
    </div>
  )
}
