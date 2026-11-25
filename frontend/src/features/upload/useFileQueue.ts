import { useCallback, useState } from 'react'

const key = (f: File) => `${f.name}:${f.size}`

/** Selected files: JSON only, de-duplicated by name + size (as in v1). */
export function useFileQueue() {
  const [files, setFiles] = useState<File[]>([])
  const [rejected, setRejected] = useState<string[]>([])

  const add = useCallback((incoming: Iterable<File>) => {
    const list = Array.from(incoming)
    const json = list.filter((f) => f.name.toLowerCase().endsWith('.json'))
    setRejected(list.filter((f) => !json.includes(f)).map((f) => f.name))
    setFiles((prev) => {
      const seen = new Set(prev.map(key))
      return [...prev, ...json.filter((f) => !seen.has(key(f)) && seen.add(key(f)))]
    })
  }, [])

  const remove = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const clear = useCallback(() => setFiles([]), [])

  return { files, rejected, add, remove, clear }
}

/** Files that look like video history, which the analysis doesn't support. */
export const isVideoHistory = (f: File) => /Streaming_History_Video/i.test(f.name)
