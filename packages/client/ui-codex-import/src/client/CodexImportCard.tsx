/** The Codex import settings card: sync toggle, manual import, and history. */

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

/**
 * Render the Codex import card.
 * @param props - locale copy, the card snapshot, and its actions.
 * @returns the card.
 */
export function CodexImportCard(props: CodexImportCardProps) {
  const { t, toggleSync, runImport, openSession } = props
  const state = props.useCodexImportCard(snapshot => snapshot)
  return (
    <section className={css.card}>
      <header className={css.header}>
        <h3 className={css.title}>{t('title')}</h3>
        <p className={css.description}>{t('description')}</p>
      </header>

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
              {state.runs.map((run, index) => (
                <li key={`${run.at}-${index}`} className={css.run}>
                  <div className={css.runHead}>
                    <span className={css.runTime}>{formatTime(run.at)}</span>
                    <span className={css.runCount}>{t('importedCount', { count: run.imported })}</span>
                  </div>
                  {run.sessions.length === 0
                    ? <p className={css.none}>{t('noSessions')}</p>
                    : (
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
                </li>
              ))}
            </ul>
          )}
      </div>
    </section>
  )
}
