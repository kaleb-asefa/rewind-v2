/**
 * Upload + session lifecycle. Uploads use XHR (not fetch) for byte progress.
 *
 * Each upload goes to a brand-new ticket so datasets never merge. The new ticket
 * only becomes active once the upload succeeded, and the previous session is then
 * deleted server-side, so a failed upload never strands the user's old data and a
 * successful one never leaves an orphaned copy behind.
 */
import type { Schemas } from './types'
import { SESSION_HEADER, generateUUID, getSessionTicket, setSessionTicket } from './session'
import { ApiError } from './client'

export type UploadResult = Schemas['UploadResult']

export interface UploadProgress {
  /** 'sending' while bytes go up (with `fraction`), then 'processing' server-side. */
  phase: 'sending' | 'processing'
  fraction: number
}

export const MAX_FILES = 50
export const MAX_TOTAL_MB = 512

export function uploadHistory(
  files: readonly File[],
  onProgress: (p: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<UploadResult> {
  const ticket = generateUUID()
  const form = new FormData()
  files.forEach((f) => form.append('files', f))

  return new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/upload')
    xhr.setRequestHeader(SESSION_HEADER, ticket)
    xhr.responseType = 'json'
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress({ phase: 'sending', fraction: e.loaded / e.total })
    }
    xhr.upload.onload = () => onProgress({ phase: 'processing', fraction: 1 })
    xhr.onerror = () => reject(new ApiError('Upload failed: the server is unreachable.', 0))
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'))
    xhr.onload = () => {
      const body = xhr.response as (UploadResult & { detail?: string }) | null
      if (xhr.status >= 200 && xhr.status < 300 && body) {
        const previous = getSessionTicket()
        setSessionTicket(ticket)
        void deleteSession(previous) // best-effort cleanup of the replaced data
        resolve(body)
      } else {
        reject(new ApiError(body?.detail ?? `Upload failed (status ${xhr.status}).`, xhr.status))
      }
    }
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(form)
  })
}

/** Permanently delete a session's data on the server. Never throws. */
export async function deleteSession(ticket = getSessionTicket()): Promise<boolean> {
  try {
    const res = await fetch('/api/session', {
      method: 'DELETE',
      headers: { [SESSION_HEADER]: ticket },
    })
    return res.ok
  } catch {
    return false
  }
}
