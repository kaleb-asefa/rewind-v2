import { Icon } from '@/components/Icon'

import { SPEEDS, type Speed } from './climbMath'

interface Props {
  playing: boolean
  onToggle: () => void
  onReset: () => void
  label: string
  progress: number
  max: number
  step: number
  onScrub: (v: number) => void
  startLabel: string
  endLabel: string
  speed: Speed
  onSpeed: (s: Speed) => void
  fullscreen: boolean
  onFullscreen: () => void
}

/** Play / reset / date / scrubber / speed / fullscreen bar shared by both races. */
export function Playback(p: Props) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3 border-b border-hairline pb-3 text-body-sm">
      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={p.onToggle}
          aria-label={p.playing ? 'Pause' : 'Play'}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-on-primary shadow transition-all hover:scale-105 hover:bg-primary-container hover:text-on-primary-container"
        >
          <Icon name={p.playing ? 'pause' : 'play_arrow'} filled className="text-base" />
        </button>
        <button
          type="button"
          onClick={p.onReset}
          aria-label="Restart"
          title="Restart"
          className="flex h-7 w-7 items-center justify-center rounded-full text-on-surface-variant transition-all hover:text-on-surface"
        >
          <Icon name="restart_alt" className="text-sm" />
        </button>
        <div
          className="rounded-full border border-hairline bg-surface-container-high px-3 py-1 font-mono text-body-sm font-bold uppercase tracking-tight text-on-surface"
          aria-live="off"
        >
          {p.label}
        </div>
      </div>
      <div className="mx-2 hidden max-w-md flex-grow items-center gap-2 md:flex">
        <span className="font-mono text-label-bold text-on-surface-variant">{p.startLabel}</span>
        <input
          type="range"
          min={0}
          max={p.max}
          step={p.step}
          value={p.progress}
          onChange={(e) => p.onScrub(Number(e.target.value))}
          aria-label="Timeline"
          aria-valuetext={p.label}
          className="velocity-scrubber w-full cursor-pointer"
        />
        <span className="font-mono text-label-bold text-on-surface-variant">{p.endLabel}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div
          className="flex items-center gap-0.5 rounded-full border border-hairline bg-surface-container-high p-0.5 font-mono text-label-bold"
          role="radiogroup"
          aria-label="Speed"
        >
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={p.speed === s}
              onClick={() => p.onSpeed(s)}
              className={`rounded-full px-2 py-0.5 transition-colors ${p.speed === s ? 'bg-primary font-bold text-on-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
            >
              {s === 1 ? '1.0' : s}x
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={p.onFullscreen}
          aria-label={p.fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-all hover:text-primary"
        >
          <Icon name={p.fullscreen ? 'fullscreen_exit' : 'fullscreen'} className="text-base" />
        </button>
      </div>
    </div>
  )
}
