/**
 * Skills 管理面板：列出用户技能根中的技能，搜索过滤，并切换每个技能
 * 是否允许模型调用（写入 SKILL.md 前言的 disable-model-invocation 标记）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import type { CodexSkillsManager, SkillLike } from '../../RightPanel.js'
import type { TFn } from '../../faces.js'
import css from '../../styles.module.css'

interface SkillsPanelProps {
  skillsManager: CodexSkillsManager | undefined
  t: TFn
}

interface SkillsState {
  skills: readonly SkillLike[] | null
  error: string | null
  notice: string | null
}

export function SkillsPanel({ skillsManager, t }: SkillsPanelProps) {
  const [state, setState] = useState<SkillsState>({ skills: null, error: null, notice: null })
  const [busy, setBusy] = useState(false)
  const [busyName, setBusyName] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const refresh = useCallback(async (): Promise<void> => {
    if (skillsManager === undefined) return
    setBusy(true)
    try {
      const result = await skillsManager.listSkills()
      setState(prev => ({
        skills: result.ok ? result.value.skills : prev.skills,
        error: result.ok ? null : result.error.message,
        notice: null,
      }))
    } catch (error) {
      setState(prev => ({ ...prev, error: error instanceof Error ? error.message : String(error) }))
    } finally {
      setBusy(false)
    }
  }, [skillsManager])

  useEffect(() => { void refresh() }, [refresh])

  const visible = useMemo(() => {
    if (state.skills === null) return null
    const normalized = query.trim().toLocaleLowerCase()
    if (normalized === '') return state.skills
    return state.skills.filter(skill =>
      skill.name.toLocaleLowerCase().includes(normalized)
      || skill.directory.toLocaleLowerCase().includes(normalized)
      || (skill.description ?? '').toLocaleLowerCase().includes(normalized))
  }, [state.skills, query])

  if (skillsManager === undefined) {
    return <div className={css.empty}>{t('skillsManagerMissing')}</div>
  }

  const toggle = async (skill: SkillLike): Promise<void> => {
    if (skillsManager === undefined) return
    setBusyName(skill.name)
    const result = await skillsManager.setSkillModelInvocation(skill.name, !skill.modelInvocable)
    setBusyName(null)
    if (result.ok) {
      setState({
        skills: result.value.snapshot.skills,
        error: result.value.status === 'failed' ? result.value.message : null,
        notice: result.value.status === 'failed' ? null : result.value.message,
      })
    } else {
      setState(prev => ({ ...prev, error: result.error.message }))
    }
  }

  return (
    <>
      <div className={css.header} style={{ borderBottom: 'none' }}>
        <span className={css.title}>{t('panelSkills')}{state.skills === null ? '' : ` (${state.skills.length})`}</span>
        <button type="button" className={css.iconButton} aria-label={t('pluginRefresh')} title={t('pluginRefresh')}
          disabled={busy} onClick={() => { void refresh() }}>
          <RefreshCw size={13} className={busy ? css.spin : undefined} />
        </button>
      </div>
      {state.error !== null && <div className={css.error}>{state.error}</div>}
      {state.notice !== null && <div className={css.notice} role="status">{state.notice}</div>}
      <div className={css.inputRow} style={{ borderTop: 'none', borderBottom: '0.5px solid var(--cx-line)' }}>
        <Search size={13} style={{ opacity: 0.55, flex: 'none' }} aria-hidden="true" />
        <input type="search" className={css.textInput} value={query}
          placeholder={t('skillsSearchPlaceholder')}
          onChange={event => { setQuery(event.currentTarget.value) }} />
      </div>
      <div className={css.pluginList} role="list" aria-label={t('panelSkills')}>
        {visible === null ? <div className={css.empty}>{t('pluginLoading')}</div> : null}
        {visible !== null && visible.length === 0
          ? <div className={css.empty}>{query.trim() === '' ? t('skillsEmpty') : t('skillsEmptySearch')}</div>
          : null}
        {visible?.map(skill => (
          <section key={skill.directory} className={css.skillRow} role="listitem"
            aria-label={`${skill.name} ${skill.directory}`}>
            <div className={css.skillRowBody}>
              <strong>{skill.name}</strong>
              <code>{skill.directory}</code>
              {skill.description !== null && <p>{skill.description}</p>}
            </div>
            <span className={css.skillRowActions}>
              <small data-kind={skill.modelInvocable ? 'on' : 'off'}>
                {skill.modelInvocable ? t('skillsModelOn') : t('skillsModelOff')}
              </small>
              <label className={css.skillSwitch} title={t('skillsToggle')}>
                <input type="checkbox" checked={skill.modelInvocable} disabled={busyName !== null}
                  aria-label={t('skillsToggle')}
                  onChange={() => { void toggle(skill) }} />
                <span aria-hidden="true" />
              </label>
            </span>
          </section>
        ))}
      </div>
    </>
  )
}
