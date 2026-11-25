import { Link } from 'react-router'

import { useApi } from '@/api/queries'
import { Icon } from '@/components/Icon'
import { MetricCard } from '@/components/MetricCard'
import { CoverImage } from '@/covers/CoverImage'
import { fmtDuration, fmtHours, plural } from '@/lib/format'

import { Heatmap } from './Heatmap'

function Value({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div
      title={title}
      className="truncate text-headline-md text-on-surface transition-colors group-hover:text-primary"
    >
      {children}
    </div>
  )
}

function Sub({ children }: { children: React.ReactNode }) {
  return <div className="mt-1 truncate text-body-sm text-on-surface-variant">{children}</div>
}

function NoData({ what }: { what: string }) {
  return (
    <>
      <Value>No Data</Value>
      <Sub>
        <Link to="/upload" className="underline hover:text-primary">
          Upload your export
        </Link>{' '}
        to see your {what}
      </Sub>
    </>
  )
}

function TotalTimeCard() {
  const q = useApi('/api/metrics/total-time')
  const minutes = Math.round(q.data?.total_minutes ?? 0)
  return (
    <MetricCard label="Total Time" icon="schedule" highlight query={q}>
      <div className="text-headline-md text-on-surface">
        {minutes.toLocaleString()} {minutes === 1 ? 'Minute' : 'Minutes'}
      </div>
      <Sub>{plural(fmtHours(minutes), 'hour')}</Sub>
    </MetricCard>
  )
}

function TopArtistCard() {
  const q = useApi('/api/metrics/top-artist')
  const d = q.data
  return (
    <MetricCard label="Top Artist" icon="person" watermark="music_note" query={q}>
      {d?.artist_name ? (
        <div className="flex items-center gap-3">
          <CoverImage
            item={{ id: d.artist_id, cover_kind: d.cover_kind, cover_id: d.cover_id }}
            kind="artist"
            className="h-12 w-12 rounded-full border border-outline-variant/40"
          />
          <div className="min-w-0">
            <Value title={d.artist_name}>{d.artist_name}</Value>
            <Sub>{d.total_streams.toLocaleString()} total streams</Sub>
          </div>
        </div>
      ) : (
        <NoData what="top artist" />
      )}
    </MetricCard>
  )
}

function TopAlbumCard() {
  const q = useApi('/api/metrics/top-album')
  const d = q.data
  return (
    <MetricCard label="Top Album" icon="album" watermark="album" query={q}>
      {d?.album_name ? (
        <div className="flex items-center gap-3">
          <CoverImage
            item={{ id: d.album_id, cover_kind: d.cover_kind, cover_id: d.cover_id }}
            kind="album"
            className="h-12 w-12 rounded-md border border-outline-variant/40"
          />
          <div className="min-w-0">
            <Value title={d.album_name}>{d.album_name}</Value>
            <Sub>
              {d.artist_name ? `by ${d.artist_name} • ` : ''}
              {fmtDuration(d.total_minutes)}
            </Sub>
          </div>
        </div>
      ) : (
        <NoData what="top album" />
      )}
    </MetricCard>
  )
}

function TopTrackCard() {
  const q = useApi('/api/metrics/top-track')
  const d = q.data
  return (
    <MetricCard label="Top Track" icon="equalizer" watermark="play_circle" query={q}>
      {d?.track_name ? (
        <div className="flex items-center gap-3">
          <CoverImage
            item={{ id: d.track_id }}
            kind="track"
            className="h-12 w-12 rounded-md border border-outline-variant/40"
          />
          <div className="min-w-0">
            <Value title={d.track_name}>{d.track_name}</Value>
            <Sub>
              {d.artist_name ? `by ${d.artist_name} • ` : ''}
              {d.total_streams.toLocaleString()} streams
            </Sub>
          </div>
        </div>
      ) : (
        <NoData what="top track" />
      )}
    </MetricCard>
  )
}

function avgListening(mins: number): string | null {
  if (!mins || mins <= 0) return null
  return mins >= 60
    ? `${(mins / 60).toLocaleString(undefined, { maximumFractionDigits: 1 })}h`
    : `${Math.round(mins)} min`
}

function HabitCards() {
  const songs = useApi('/api/metrics/total-songs')
  const day = useApi('/api/metrics/active-day')
  // v1 showed hard-coded joke cards here; these are real records instead.
  const records = useApi('/api/metrics/superlatives', { range: 'all', limit: 1 })
  const skipped = records.data?.most_skipped[0]
  const loyal = records.data?.never_skipped[0]
  const avg = day.data ? avgListening(day.data.average_minutes) : null

  return (
    <section className="grid grid-cols-1 gap-gutter md:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        label="Total Songs"
        icon="library_music"
        accent="primary"
        className="border-l-4 border-l-primary/30"
        query={songs}
      >
        <Value>{songs.data?.total_songs ? songs.data.total_songs.toLocaleString() : '—'}</Value>
        <Sub>Unique tracks identified</Sub>
      </MetricCard>
      <MetricCard
        label="Most Active Day"
        icon="calendar_today"
        accent="primary"
        className="border-l-4 border-l-primary/30"
        query={day}
      >
        <Value>{day.data?.weekday ?? '—'}</Value>
        <Sub>
          {day.data?.weekday
            ? avg
              ? `Average ${avg} listening`
              : 'Average listening'
            : 'No activity yet'}
        </Sub>
      </MetricCard>
      <MetricCard
        label="Most Skipped Track"
        icon="thumb_down"
        accent="error"
        className="border-l-4 border-l-error/30"
        query={records}
      >
        <Value title={skipped?.name ?? undefined}>{skipped?.name ?? '—'}</Value>
        <Sub>
          {skipped
            ? `${skipped.artist ? `${skipped.artist} • ` : ''}skipped ${skipped.skip_pct}% of ${skipped.plays} plays`
            : 'Not enough plays yet'}
        </Sub>
      </MetricCard>
      <MetricCard
        label="Never Skipped"
        icon="favorite"
        accent="primary"
        className="border-l-4 border-l-primary/30"
        query={records}
      >
        <Value title={loyal?.name ?? undefined}>{loyal?.name ?? '—'}</Value>
        <Sub>
          {loyal
            ? `${loyal.artist ? `${loyal.artist} • ` : ''}${loyal.plays} plays, zero skips`
            : 'Not enough plays yet'}
        </Sub>
      </MetricCard>
    </section>
  )
}

export default function OverviewPage() {
  return (
    <main className="mx-auto max-w-[1440px] space-y-section-gap px-container-padding-mobile pb-section-gap pt-24 md:px-container-padding-desktop">
      <section
        className="grid grid-cols-1 gap-gutter md:grid-cols-2 lg:grid-cols-4"
        aria-label="Highlights"
      >
        <TotalTimeCard />
        <TopArtistCard />
        <TopAlbumCard />
        <TopTrackCard />
      </section>
      <Heatmap />
      <HabitCards />
      <nav className="flex flex-wrap gap-4">
        <Link
          to="/explore"
          className="btn-pill flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-on-primary hover:shadow-spotify-green"
        >
          Explore the deep dive <Icon name="arrow_forward" />
        </Link>
        <Link
          to="/charts"
          className="btn-pill flex items-center gap-2 rounded-full border border-outline px-6 py-3 text-on-surface hover:border-on-surface"
        >
          See your charts <Icon name="leaderboard" />
        </Link>
      </nav>
    </main>
  )
}
