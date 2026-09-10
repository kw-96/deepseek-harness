/** The Codex import settings card: sync toggle, manual import, and history. */

import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from './codex-import-card-controller.ts'
import type { CodexImportCardFace } from './codex-import-card-controller.ts'
import { NS } from './locales.ts'
import css from './CodexImportCard.module.css'

/** Props the renderer binds for the Codex import card. */
export type CodexImportCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<typeof NS>
  & InjectFace<CodexImportCardFace>

/** Format a run timestamp in the browser's current locale. */
function formatTime(at: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(at)
}

/** Stable disclosure key for one history run entry. */
function runKey(at: number, index: number): string {
  return `${at}-${index}`
}

/** Run fields the count pills read. */
interface RunCountsProps {
  run: { at: number; imported: number; updated: number; deferredActive: number }
  t: CodexImportCardProps['t']
}

/** The per-run count pills: timestamp plus the sweep's outcome counters. */
function RunCounts(props: RunCountsProps) {
  const { run, t } = props
  return (
    <>
      <span className={css.runTime}>{formatTime(run.at)}</span>
      <span className={css.runCount}>{t('importedCount', { count: run.imported })}</span>
      {run.updated > 0 && <span className={css.runCount}>{t('updatedCount', { count: run.updated })}</span>}
      {run.deferredActive > 0 && <span className={css.runCount}>{t('deferredActiveCount', { count: run.deferredActive })}</span>}
    </>
  )
}

/**
 * Render the Codex import card.
 * @param props - locale copy, the card snapshot, and its actions.
 * @returns the card.
 */
export function CodexImportCard(props: CodexImportCardProps) {
  const { t, toggleSync, runImport, openSession } = props
  const state = props.useCodexImportCard(snapshot => snapshot)
  // Card disclosure: matches the sibling plugin cards, collapsed by default,
  // so the header names the plugin over its description before any controls.
  const [open, setOpen] = useState(false)
  // Per-run disclosure is card-local reading state: which runs the user has
  // opened is a viewing gesture nobody outside the card has a stake in. The
  // newest run starts open; an import prepending a newer run opens it too.
  const newest = state.runs[0]
  const firstRunKey = newest === undefined ? undefined : runKey(newest.at, 0)
  const [openRuns, setOpenRuns] = useState<ReadonlySet<string>>(() => {
    return firstRunKey === undefined ? new Set<string>() : new Set([firstRunKey])
  })
  const previousFirstRunKey = useRef(firstRunKey)
  useEffect(() => {
    if (firstRunKey !== undefined && previousFirstRunKey.current !== firstRunKey) {
      setOpenRuns(previous => new Set([firstRunKey, ...previous]))
    }
    previousFirstRunKey.current = firstRunKey
  }, [firstRunKey])
  const toggleRun = (key: string): void => {
    setOpenRuns((previous) => {
      const next = new Set(previous)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }
  const title = t('title')
  return (
    <li className={clsx(css.card, open && css.cardOpen)}>
      <button
        type="button"
        className={css.header}
        aria-expanded={open}
        aria-label={`${t(open ? 'collapse' : 'expand')}: ${title}`}
        onClick={() => { setOpen(!open) }}
      >
        <span className={css.headText}>
          <span className={css.name}>{title}</span>
          <span className={css.description}>{t('description')}</span>
        </span>
        <IconChevronDownOutline14 className={clsx(css.chevron, open && css.chevronOpen)} />
      </button>

      {open ? (
        <div className={css.body}>
          <div className={css.controls}>
            <label className={css.toggle}>
              <input
                type="checkbox"
                checked={state.autoSync}
                onChange={(event) => { toggleSync(event.target.checked) }}
              />
              <span>{t('sync')}</span>
            </label>
            <button
              type="button"
              className={css.run}
              disabled={state.running}
              onClick={() => { runImport() }}
            >
              {state.running ? t('running') : t('run')}
            </button>
          </div>

          <div className={css.history}>
            <h4 className={css.historyTitle}>{t('historyTitle')}</h4>
            {state.runs.length === 0
              ? <p className={css.empty}>{t('empty')}</p>
              : (
                <ul className={css.runs}>
                  {state.runs.map((run, index) => {
                    const key = runKey(run.at, index)
                    const isOpen = openRuns.has(key)
                    return (
                      <li key={key} className={css.run}>
                        {run.sessions.length === 0
                          ? (
                            <>
                              <div className={css.runHead}>
                                <RunCounts run={run} t={t} />
                              </div>
                              <p className={css.none}>{t('noSessions')}</p>
                            </>
                          )
                          : (
                            <>
                              <button
                                type="button"
                                className={css.runHead}
                                aria-expanded={isOpen}
                                onClick={() => { toggleRun(key) }}
                              >
                                <RunCounts run={run} t={t} />
                                <IconChevronDownOutline14 className={clsx(css.chevron, isOpen && css.chevronOpen)} />
                              </button>
                              {isOpen && (
                                <ul className={css.sessions}>
                                  {run.sessions.map(session => (
                                    <li key={session.id} className={css.session}>
                                      <span className={css.sessionTitle}>
                                        {session.title === '' ? session.id : session.title}
                                      </span>
                                      <button
                                        type="button"
                                        className={css.open}
                                        onClick={() => { openSession(session.id) }}
                                      >
                                        {t('open')}
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </>
                          )}
                      </li>
                    )
                  })}
                </ul>
              )}
          </div>
        </div>
      ) : null}
    </li>
  )
}
