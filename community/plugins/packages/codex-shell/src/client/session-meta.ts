/** Per-session pin/unread meta plus pinned summary notes, shared inside the plugin. */

import { useCallback, useEffect, useRef, useState } from 'react'
import { readPersisted, writePersisted } from './persistence.js'

export interface SessionMeta {
  pinned: boolean
  unread: boolean
}

export interface PinnedNote {
  id: string
  text: string
  at: number
}

interface MetaFile {
  [sessionId: string]: SessionMeta
}

const META_KEY = 'dsh-codex-shell.meta.v1'

const summaryKey = (sessionId: string): string => `dsh-codex-shell.summary.v1.${sessionId}`

/**
 * A tiny store for row decorations and pinned summaries. Created in apply and
 * handed to registrants through their inject faces: local state per hook, so
 * cross-component updates are driven by the browser's refresh events instead
 * of a bespoke subscription bus.
 */
export class SessionMetaStore {
  private metas: MetaFile

  constructor() {
    this.metas = readPersisted<MetaFile>(META_KEY, {})
  }

  meta(sessionId: string): SessionMeta {
    return this.metas[sessionId] ?? { pinned: false, unread: false }
  }

  set(sessionId: string, patch: Partial<SessionMeta>): SessionMeta {
    const next = { ...this.meta(sessionId), ...patch }
    this.metas = { ...this.metas, [sessionId]: next }
    writePersisted(META_KEY, JSON.stringify(this.metas))
    return next
  }

  notes(sessionId: string): readonly PinnedNote[] {
    return readPersisted<PinnedNote[]>(summaryKey(sessionId), [])
  }

  addNote(sessionId: string, text: string): void {
    const trimmed = text.trim()
    if (trimmed === '') return
    const notes = this.notes(sessionId)
    const next = [...notes, { id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text: trimmed, at: Date.now() }]
    writePersisted(summaryKey(sessionId), JSON.stringify(next))
  }

  removeNote(sessionId: string, id: string): void {
    const notes = this.notes(sessionId).filter(note => note.id !== id)
    writePersisted(summaryKey(sessionId), JSON.stringify(notes))
  }
}

/** Reactive wrapper for one session's meta row. */
export function useSessionMeta(store: SessionMetaStore | undefined, sessionId: string | undefined): [SessionMeta, (patch: Partial<SessionMeta>) => void] {
  const [meta, setMeta] = useState<SessionMeta>(() => (sessionId === undefined || store === undefined ? { pinned: false, unread: false } : store.meta(sessionId)))
  const idRef = useRef(sessionId)
  useEffect(() => {
    if (idRef.current !== sessionId) {
      idRef.current = sessionId
      setMeta(sessionId === undefined || store === undefined ? { pinned: false, unread: false } : store.meta(sessionId))
    }
  }, [sessionId, store])
  const update = useCallback((patch: Partial<SessionMeta>) => {
    if (store === undefined || sessionId === undefined) return
    setMeta(store.set(sessionId, patch))
  }, [store, sessionId])
  return [meta, update]
}

/** Reactive wrapper for one session's pinned notes. */
export function useSessionNotes(store: SessionMetaStore | undefined, sessionId: string | undefined): [readonly PinnedNote[], (text: string) => void, (id: string) => void] {
  const [notes, setNotes] = useState<readonly PinnedNote[]>(() => (sessionId === undefined || store === undefined ? [] : store.notes(sessionId)))
  const idRef = useRef(sessionId)
  useEffect(() => {
    if (idRef.current !== sessionId) {
      idRef.current = sessionId
      setNotes(sessionId === undefined || store === undefined ? [] : store.notes(sessionId))
    }
  }, [sessionId, store])
  const add = useCallback((text: string) => {
    if (store === undefined || sessionId === undefined) return
    store.addNote(sessionId, text)
    setNotes(store.notes(sessionId))
  }, [store, sessionId])
  const remove = useCallback((id: string) => {
    if (store === undefined || sessionId === undefined) return
    store.removeNote(sessionId, id)
    setNotes(store.notes(sessionId))
  }, [store, sessionId])
  return [notes, add, remove]
}
