/** Failure-safe localStorage persistence for codex-shell preferences. */

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'

const memory = new Map<string, string>()

function storage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const key = '__dsh_codex_shell_storage_probe__'
    window.localStorage.setItem(key, key)
    window.localStorage.removeItem(key)
    return window.localStorage
  } catch {
    return undefined
  }
}

/** Read one serialized preference, falling back on failure. */
export function readPersisted<T>(key: string, fallback: T, deserialize: (raw: string) => T = JSON.parse): T {
  try {
    const raw = storage()?.getItem(key) ?? memory.get(key)
    if (raw === undefined || raw === null) return fallback
    return deserialize(raw)
  } catch {
    return fallback
  }
}

/** Write one serialized preference; failures are silent (preferences only). */
export function writePersisted(key: string, value: string): void {
  try {
    const local = storage()
    if (local === undefined) memory.set(key, value)
    else local.setItem(key, value)
  } catch {
    // Quota or storage policy failures do not disable the shell.
  }
}

/** React state backed by localStorage (mirrors the marketplace preference hook). */
export function usePersistedState<T>(key: string, fallback: T): [T, Dispatch<SetStateAction<T>>] {
  const deserializer = useMemo(() => ((raw: string) => JSON.parse(raw) as T), [])
  const [value, setValue] = useState<T>(() => readPersisted(key, fallback, deserializer))
  useEffect(() => {
    try { writePersisted(key, JSON.stringify(value)) } catch { /* persist failures are silent */ }
  }, [key, value])
  return [value, setValue]
}
