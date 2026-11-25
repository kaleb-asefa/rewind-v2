import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type DragEvent } from 'react'
import { Link, useNavigate } from 'react-router'

import { ApiError } from '@/api/client'
import { rotateSessionTicket } from '@/api/session'
import {
  MAX_FILES,
  MAX_TOTAL_MB,
  deleteSession,
  uploadHistory,
  type UploadProgress,
} from '@/api/upload'
import { Icon } from '@/components/Icon'

import { isVideoHistory, useFileQueue } from './useFileQueue'

type Status = { kind: 'info' | 'error' | 'success'; text: string } | null

const STATUS_STYLE = {
  info: 'bg-primary/10 text-on-surface border border-primary/20',
  error: 'bg-error/10 text-error border border-error/20',
  success: 'bg-primary/10 text-primary border border-primary/20',
} as const

const STEPS = [
  [
    'Locate your Spotify data export folder.',
    "This is usually a .zip file received via email from Spotify's privacy dashboard.",
  ],
  [
    'Select only JSON files containing audio history.',
    'We parse your listening patterns directly from these files.',
  ],
] as const

function Code({ children }: { children: string }) {
  return (
    <code className="rounded bg-surface-variant px-1.5 py-0.5 font-mono text-sm text-primary">
      {children}
    </code>
  )
}

export default function UploadPage() {
  const { files, rejected, add, remove, clear } = useFileQueue()
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const [status, setStatus] = useState<Status>(null)
  const input = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const busy = progress !== null
  const totalMb = files.reduce((n, f) => n + f.size, 0) / (1024 * 1024)
  const videos = files.filter(isVideoHistory)

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (!busy) add(e.dataTransfer.files)
  }

  async function analyze() {
    if (!files.length) return navigate('/overview')
    setStatus({
      kind: 'info',
      text: 'Merging your library and matching tracks against the catalog — this can take a moment…',
    })
    setProgress({ phase: 'sending', fraction: 0 })
    try {
      await uploadHistory(files, setProgress)
      queryClient.clear() // everything cached belonged to the previous session
      navigate('/overview')
    } catch (err) {
      setProgress(null)
      setStatus({
        kind: 'error',
        text:
          err instanceof ApiError
            ? err.message
            : 'Upload failed. Please ensure the backend server is reachable and try again.',
      })
    }
  }

  async function resetSession() {
    await deleteSession()
    rotateSessionTicket()
    queryClient.clear()
    clear()
    setStatus({ kind: 'success', text: 'Your data was deleted. You have a fresh slate.' })
  }

  const buttonLabel = !busy
    ? 'Analyze All Files'
    : progress.phase === 'sending'
      ? `Uploading… ${Math.round(progress.fraction * 100)}%`
      : `Analyzing ${files.length} file${files.length === 1 ? '' : 's'}…`

  return (
    <main className="mx-auto w-full max-w-7xl flex-grow px-container-padding-mobile pb-section-gap pt-32 md:px-container-padding-desktop">
      <div className="grid grid-cols-1 items-center gap-16 md:grid-cols-2">
        {/* Instructions */}
        <div className="space-y-8">
          <div className="space-y-2">
            <span className="text-label-bold uppercase tracking-widest text-primary">
              Getting Started
            </span>
            <h1 className="text-display-lg-mobile leading-tight text-on-surface md:text-display-lg">
              Import Your History
            </h1>
          </div>
          <ol className="space-y-6">
            {STEPS.map(([title, sub], i) => (
              <li
                key={title}
                className="relative pl-6 before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:rounded-sm before:bg-primary before:opacity-30"
              >
                <p className="text-body-lg text-on-surface">
                  {i + 1}. {title}
                </p>
                <p className="mt-1 text-body-sm text-on-surface-variant">{sub}</p>
              </li>
            ))}
            <li className="relative pl-6 before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:rounded-sm before:bg-primary before:opacity-30">
              <p className="text-body-lg text-on-surface">
                3. Look for files named like <Code>Streaming_History_Audio_YYYY_N.json</Code>.
              </p>
              <p className="mt-1 text-body-sm text-on-surface-variant">
                Example: Streaming_History_Audio_2025_1.json
              </p>
            </li>
          </ol>
          <div className="flex gap-3 rounded-lg border border-error/20 bg-error/10 p-4">
            <Icon name="warning" className="text-error" />
            <p className="text-body-sm text-on-surface">
              <span className="font-bold text-error">Important:</span> Do not upload video history
              files (e.g. <Code>Streaming_History_Video_YYYY_N.json</Code>). These are not supported
              for analysis.
            </p>
          </div>
          <Link
            to="/#how-it-works"
            className="group flex items-center gap-2 text-body-sm text-on-surface-variant transition-colors hover:text-primary"
          >
            <Icon name="help" className="text-[18px]" />
            Need help getting your data? View the guide
            <Icon
              name="arrow_forward"
              className="text-[16px] transition-transform group-hover:translate-x-1"
            />
          </Link>
        </div>

        {/* Upload zone */}
        <div className="glass-card relative flex min-h-[480px] flex-col rounded-xl p-8">
          <div
            role="button"
            tabIndex={0}
            aria-label="Choose Spotify history JSON files"
            aria-disabled={busy}
            onClick={() => !busy && input.current?.click()}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !busy) {
                e.preventDefault()
                input.current?.click()
              }
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`group flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-all hover:border-primary hover:bg-primary/5 ${
              files.length ? 'h-48' : 'flex-grow'
            } ${dragging ? 'border-primary bg-primary/10' : 'border-outline-variant'}`}
          >
            <input
              ref={input}
              type="file"
              accept=".json,application/json"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) add(e.target.files)
                e.target.value = '' // allow re-selecting the same file
              }}
            />
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-surface-variant/50 transition-all group-hover:scale-110 group-hover:bg-primary-container/20">
              <Icon
                name="upload_file"
                className="text-4xl text-secondary group-hover:text-primary"
              />
            </div>
            <h2 className="mb-2 text-headline-md text-on-surface">Ready to Rewind?</h2>
            <p className="mx-auto mb-8 max-w-xs text-body-lg text-on-surface-variant">
              Drop your JSON files here, or browse.
            </p>
            <span className="rounded-full bg-primary px-10 py-4 text-body-lg font-bold text-on-primary transition-all group-hover:shadow-spotify-green">
              Browse Files
            </span>
            <p className="mt-6 text-body-sm text-on-surface-variant">
              Up to {MAX_FILES} files, {MAX_TOTAL_MB} MB in total
            </p>
          </div>

          {rejected.length > 0 && (
            <p className="mt-3 text-body-sm text-error">
              Skipped {rejected.length} non-JSON file{rejected.length === 1 ? '' : 's'}:{' '}
              {rejected.join(', ')}
            </p>
          )}

          {files.length > 0 && (
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-label-bold uppercase tracking-wider text-secondary">
                  Queue
                </span>
                <span className="text-label-bold text-primary">
                  {files.length} file{files.length === 1 ? '' : 's'} · {totalMb.toFixed(1)} MB
                </span>
              </div>
              <ul className="max-h-48 space-y-2 overflow-y-auto pr-2">
                {files.map((file, i) => (
                  <li
                    key={`${file.name}:${file.size}`}
                    className="flex items-center justify-between rounded-lg border border-hairline bg-surface-variant/30 p-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Icon
                        name={isVideoHistory(file) ? 'videocam_off' : 'description'}
                        className={`text-[20px] ${isVideoHistory(file) ? 'text-error' : 'text-primary'}`}
                      />
                      <div className="flex min-w-0 flex-col">
                        <span className="max-w-[220px] truncate text-body-sm font-medium text-on-surface">
                          {file.name}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">
                          {(file.size / 1024).toFixed(1)} KB
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => remove(i)}
                      aria-label={`Remove ${file.name}`}
                      className="text-on-surface-variant transition-colors hover:text-error disabled:opacity-40"
                    >
                      <Icon name="close" className="text-[18px]" />
                    </button>
                  </li>
                ))}
              </ul>
              {videos.length > 0 && (
                <p className="text-body-sm text-error">
                  {videos.length} video history file{videos.length === 1 ? '' : 's'} in the queue —
                  remove {videos.length === 1 ? 'it' : 'them'} for accurate results.
                </p>
              )}
              {busy && (
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-surface-variant"
                  role="progressbar"
                  aria-label="Upload progress"
                  aria-valuenow={Math.round(progress.fraction * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className={`h-full rounded-full bg-primary transition-[width] ${progress.phase === 'processing' ? 'animate-pulse' : ''}`}
                    style={{ width: `${Math.round(progress.fraction * 100)}%` }}
                  />
                </div>
              )}
              <button
                type="button"
                onClick={analyze}
                disabled={busy}
                className="mt-4 block w-full rounded-full bg-on-surface py-3 text-center font-bold text-surface transition-colors hover:opacity-90 disabled:opacity-75"
              >
                {buttonLabel}
              </button>
            </div>
          )}

          {status && (
            <div
              role="status"
              className={`mt-4 rounded-lg p-3 text-body-sm font-medium ${STATUS_STYLE[status.kind]}`}
            >
              {status.text}
            </div>
          )}

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={resetSession}
              disabled={busy}
              title="Deletes your uploaded history from the server and starts a fresh session"
              className="inline-flex items-center gap-1 text-xs text-on-surface-variant underline transition-colors hover:text-primary disabled:opacity-40"
            >
              <Icon name="restart_alt" className="text-sm" />
              Delete my data and start fresh
            </button>
          </div>
          <div
            aria-hidden
            className="absolute right-0 top-1/2 -z-10 h-64 w-64 rounded-full bg-primary/10 blur-[120px]"
          />
        </div>
      </div>
    </main>
  )
}
