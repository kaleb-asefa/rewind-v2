import { useState } from 'react'

import type { Schemas } from '@/api/types'
import { Card } from '@/components/Card'
import { atPointer, useFloatingTooltip } from '@/components/FloatingTooltip'
import { TipBody } from '@/components/TipBody'

import { Chapter, Label, Panel, Reveal } from '../Chapter'
import { HelpPopover } from '../HelpPopover'
import { CATALOG_REASON } from '../CatalogNotice'
import { type Zone, moodZone, paceWord } from '../words'
import { useExploreApi } from '../yearFilterContext'

const MID = 0.5

const VIBE_WORD: Record<Zone, string> = {
  Chill: 'Feel-good',
  Pumped: 'Upbeat',
  Moody: 'Moody',
  Intense: 'Intense',
}
const VIBE_PHRASE: Record<Zone, string> = {
  Chill: 'easy, positive songs you sink into',
  Pumped: 'bright, high-energy anthems',
  Moody: 'slow, emotional songs',
  Intense: 'dark, high-energy tracks',
}

/** Valence × energy scatter; dot size by plays; ring = your average. */
function MoodMap({
  tracks,
  center,
}: {
  tracks: Schemas['MoodTrack'][]
  center: { v: number; e: number }
}) {
  const tip = useFloatingTooltip()
  const [hover, setHover] = useState<number | null>(null)
  const S = 320
  const pad = 40
  const plot = S - pad * 2
  const mid = S / 2
  const px = (v: number) => pad + v * plot
  const py = (e: number) => pad + (1 - e) * plot
  const maxPlays = Math.max(1, ...tracks.map((t) => t.plays))
  const zoneLabel = (x: number, y: number, anchor: 'start' | 'end', txt: string) => (
    <text
      x={x}
      y={y}
      fill="var(--axis-label)"
      fontSize="10"
      fontWeight="700"
      textAnchor={anchor}
      letterSpacing="0.05em"
    >
      {txt}
    </text>
  )
  return (
    <div className="relative mt-3 flex justify-center">
      <svg
        viewBox={`0 0 ${S} ${S}`}
        className="h-auto w-full max-w-[440px]"
        role="img"
        aria-label="Your most-played tracks by positivity and energy"
      >
        <rect
          x={pad}
          y={pad}
          width={plot}
          height={plot}
          rx="14"
          fill="none"
          stroke="var(--grid-line)"
        />
        <line x1={pad} y1={py(MID)} x2={S - pad} y2={py(MID)} stroke="var(--grid-line-strong)" />
        <line x1={px(MID)} y1={pad} x2={px(MID)} y2={S - pad} stroke="var(--grid-line-strong)" />
        {zoneLabel(pad + 8, pad + 16, 'start', 'INTENSE')}
        {zoneLabel(S - pad - 8, pad + 16, 'end', 'PUMPED')}
        {zoneLabel(pad + 8, S - pad - 9, 'start', 'IN MY FEELS')}
        {zoneLabel(S - pad - 8, S - pad - 9, 'end', 'CHILL')}
        <text
          x={mid}
          y={S - 12}
          fill="var(--axis-label)"
          fontSize="9"
          fontWeight="600"
          textAnchor="middle"
        >
          SAD → HAPPY
        </text>
        <text
          x="14"
          y={mid}
          fill="var(--axis-label)"
          fontSize="9"
          fontWeight="600"
          textAnchor="middle"
          transform={`rotate(-90 14 ${mid})`}
        >
          CALM → ENERGETIC
        </text>
        {tracks.map((t, i) => (
          <circle
            key={`${t.name}-${i}`}
            className={`mood-dot ${hover === i ? 'is-hover' : ''}`}
            cx={px(t.valence)}
            cy={py(t.energy)}
            r={4 + (t.plays / maxPlays) * 7}
            fill="rgb(var(--accent-rgb))"
            fillOpacity="0.75"
            onMouseEnter={(e) => {
              setHover(i)
              tip.show(
                atPointer(e),
                <TipBody title={t.name} value={moodZone(t.valence, t.energy)} />,
              )
            }}
            onMouseMove={(e) =>
              tip.show(
                atPointer(e),
                <TipBody title={t.name} value={moodZone(t.valence, t.energy)} />,
              )
            }
            onMouseLeave={() => {
              setHover(null)
              tip.hide()
            }}
          />
        ))}
        <circle
          cx={px(center.v)}
          cy={py(center.e)}
          r="10"
          fill="none"
          stroke="var(--emphasis)"
          strokeWidth="2.5"
          pointerEvents="none"
        />
        <circle
          cx={px(center.v)}
          cy={py(center.e)}
          r="3.5"
          fill="var(--emphasis)"
          pointerEvents="none"
        />
      </svg>
      {tip.node}
    </div>
  )
}

/** Half-circle tempo gauge, 60–190 BPM. */
function PaceGauge({ bpm }: { bpm: number }) {
  const cx = 120
  const cy = 125
  const R = 92
  const p = Math.max(0, Math.min(1, (bpm - 60) / 130))
  const at = (pp: number, rad: number) => {
    const th = Math.PI * (1 - pp)
    return [cx + rad * Math.cos(th), cy - rad * Math.sin(th)] as const
  }
  const end = at(p, R)
  const needle = at(p, R - 16)
  return (
    <svg
      viewBox="0 0 240 150"
      className="h-auto w-full max-w-[280px]"
      role="img"
      aria-label={`Average tempo ${Math.round(bpm)} BPM`}
    >
      <path
        d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
        fill="none"
        stroke="var(--grid-line-strong)"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path
        d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${end[0]} ${end[1]}`}
        fill="none"
        stroke="rgb(var(--accent-rgb))"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <line
        x1={cx}
        y1={cy}
        x2={needle[0]}
        y2={needle[1]}
        stroke="var(--emphasis)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r="5" fill="var(--emphasis)" />
      <text x={cx - R} y={cy + 18} fill="var(--axis-label)" fontSize="9" textAnchor="middle">
        Slow
      </text>
      <text x={cx + R} y={cy + 18} fill="var(--axis-label)" fontSize="9" textAnchor="middle">
        Fast
      </text>
    </svg>
  )
}

/** "Between two words" slider, 0..1. */
function Spectrum({ left, right, value }: { left: string; right: string; value: number }) {
  const p = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-[11px] text-on-surface-variant">
        <span>{left}</span>
        <span>{right}</span>
      </div>
      <div
        className="relative h-1.5 rounded-full bg-surface-container-high"
        role="meter"
        aria-label={`${left} to ${right}`}
        aria-valuenow={p}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary/30"
          style={{ width: `${p}%` }}
        />
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-white shadow"
          style={{ left: `${p}%` }}
        />
      </div>
    </div>
  )
}

export function SoundChapter() {
  const query = useExploreApi('/api/metrics/audio')
  return (
    <Chapter
      id="sound"
      title="Your Sound"
      query={query}
      isEmpty={(d) => !d.avg || !d.tracks.length}
      emptyReason={(d) => (d.catalog_missing || d.has_history ? CATALOG_REASON : undefined)}
    >
      {(d) => {
        const avg = d.avg!
        const zone = moodZone(avg.valence, avg.energy)
        const tempo = d.tempo_avg ?? 0
        return (
          <>
            {d.coverage < 0.75 && (
              <p className="-mt-4 text-body-sm text-on-surface-variant">
                Based on the {Math.round(d.coverage * 100)}% of your songs we could match to audio
                data.
              </p>
            )}
            <div className="grid grid-cols-1 gap-gutter lg:grid-cols-3">
              <Panel
                className="lg:col-span-2"
                title="Your music moods"
                help={
                  <HelpPopover title="How the mood map works">
                    <p>
                      Every track is placed by two Spotify audio features — positivity (left →
                      right) and energy (bottom → top). The midpoint of each splits four moods:
                    </p>
                    <ul className="help-list">
                      <li>
                        <b>Pumped</b> — positive and high-energy
                      </li>
                      <li>
                        <b>Intense</b> — darker but high-energy
                      </li>
                      <li>
                        <b>Chill</b> — calm and positive
                      </li>
                      <li>
                        <b>Moody</b> — calm and downbeat
                      </li>
                    </ul>
                    <p>Your headline word is wherever most of your listening lands.</p>
                  </HelpPopover>
                }
              >
                <MoodMap tracks={d.tracks} center={{ v: avg.valence, e: avg.energy }} />
              </Panel>
              <Reveal className="flex flex-col">
                <Card className="flex flex-1 flex-col justify-center rounded-2xl p-5">
                  <Label>Your music in a word</Label>
                  <div className="mt-1 text-display-lg-mobile leading-tight text-primary">
                    {VIBE_WORD[zone]}
                  </div>
                  <div className="text-body-sm text-on-surface-variant">
                    Most of your music is {VIBE_PHRASE[zone]}.
                  </div>
                </Card>
              </Reveal>
            </div>
            <div className="grid grid-cols-1 gap-gutter md:grid-cols-2">
              <Panel title="Your pace">
                <div className="mt-2 flex flex-1 flex-col items-center justify-center">
                  <PaceGauge bpm={tempo} />
                  <div className="-mt-3 text-headline-md text-primary">{paceWord(tempo)}</div>
                  <div className="font-mono text-[11px] text-on-surface-variant">
                    ~{tempo} BPM on average
                  </div>
                </div>
              </Panel>
              <Panel title="Your vibe">
                <div className="mt-4 space-y-5">
                  <Spectrum left="Acoustic" right="Produced" value={1 - avg.acousticness} />
                  <Spectrum left="Easy listening" right="Dancefloor" value={avg.danceability} />
                  <Spectrum left="Instrumental" right="Vocal" value={avg.vocal} />
                </div>
              </Panel>
            </div>
          </>
        )
      }}
    </Chapter>
  )
}
