import { useEffect, useState } from 'react'
import type { SkillMutationReceipt, SkillRecord, SkillsSnapshot } from '../../types.js'
import type { LocaleKey } from '../locales.js'
import css from './SkillsPanel.module.css'

/** 技能面板可调用的远端操作。 */
export interface SkillsPanelApi {
  list: () => Promise<SkillsSnapshot>
  setModelInvocation: (skillName: string, enabled: boolean) => Promise<SkillMutationReceipt>
}

/** 技能面板渲染属性。 */
export interface SkillsPanelProps extends SkillsPanelApi {
  t: (key: LocaleKey) => string
  locale: string
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; snapshot: SkillsSnapshot }

/** 在插件管理页提供技能列表与「允许模型调用」开关。 */
export function SkillsPanel(props: SkillsPanelProps) {
  const { t, list, setModelInvocation } = props
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ severity: 'error'; message: string } | null>(null)

  const refresh = (): void => {
    setState({ status: 'loading' })
    setFeedback(null)
    void list().then(snapshot => { setState({ status: 'ready', snapshot }) }, error => {
      setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
    })
  }

  useEffect(() => { refresh() }, [list])

  /** 切换一个技能的模型调用开关，并采纳回执中的最新快照。 */
  const run = async (skill: SkillRecord): Promise<void> => {
    setBusy(true)
    setFeedback(null)
    try {
      const receipt = await setModelInvocation(skill.directory, !skill.modelInvocable)
      setState({ status: 'ready', snapshot: receipt.snapshot })
      if (receipt.status === 'failed') {
        setFeedback({ severity: 'error', message: receipt.message ?? t('skillsToggleFailed') })
      }
    } catch (error) {
      setFeedback({ severity: 'error', message: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }

  if (state.status === 'loading') return <p className={css.message}>{t('loading')}</p>
  if (state.status === 'error') {
    return (
      <div className={css.error} role="alert">
        <span>{t('error')} <small>{state.message}</small></span>
        <button type="button" onClick={refresh}>{t('retry')}</button>
      </div>
    )
  }

  const { snapshot } = state
  return (
    <section className={css.panel} aria-label={t('skillsTitle')}>
      <header className={css.toolbar}>
        <h3>{t('skillsTitle')}</h3>
        <button type="button" onClick={refresh} disabled={busy}>{t('skillsRefresh')}</button>
      </header>
      <p className={css.root}>{t('skillsRootLabel')}<code>{snapshot.skillsRoot}</code></p>
      {feedback !== null ? <p className={css.feedback} role="alert">{feedback.message}</p> : null}
      {snapshot.skills.length === 0 ? <p className={css.message}>{t('skillsEmpty')}</p> : null}
      <ul className={css.list}>
        {snapshot.skills.map(skill => (
          <li key={skill.directory}>
            <div className={css.row}>
              <span className={css.name}>
                {skill.name}
                <small>{skill.directory}</small>
                {skill.description === null ? null : <small className={css.desc}>{skill.description}</small>}
              </span>
              <Toggle
                checked={skill.modelInvocable}
                disabled={busy}
                label={`${skill.name}: ${t('skillsInvocable')}`}
                onChange={() => { void run(skill) }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** 允许模型调用开关。 */
function Toggle({ checked, disabled, label, onChange }: { checked: boolean; disabled: boolean; label: string; onChange: () => void }) {
  return (
    <label className={css.switch} title={label}>
      <input type="checkbox" checked={checked} disabled={disabled} aria-label={label} onChange={onChange} />
      <span aria-hidden="true" />
    </label>
  )
}
