import { useEffect, useState, type ReactNode } from 'react'
import type { McpMutationReceipt, McpServerInput, McpServerRecord, McpServersSnapshot } from '../types.js'
import type { LocaleKey } from './locales.js'
import { emptyMcpForm, formFromRecord, inputFromForm, type McpFormState } from './mcp-form.js'
import css from './McpServersPanel.module.css'

/** MCP 服务面板可调用的远端操作。 */
export interface McpServersPanelApi {
  list: () => Promise<McpServersSnapshot>
  save: (input: McpServerInput, enabled: boolean) => Promise<McpMutationReceipt>
  remove: (serverName: string) => Promise<McpMutationReceipt>
  setEnabled: (serverName: string, enabled: boolean) => Promise<McpMutationReceipt>
}

/** MCP 服务面板渲染属性。 */
export interface McpServersPanelProps extends McpServersPanelApi {
  t: (key: LocaleKey) => string
  locale: string
}

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; servers: readonly McpServerRecord[] }
type Editor = { open: boolean; editing: boolean; form: McpFormState }

/** 在插件管理页提供 MCP 服务的列表与编辑。 */
export function McpServersPanel(props: McpServersPanelProps) {
  const { t, list, save, remove, setEnabled } = props
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [editor, setEditor] = useState<Editor>({ open: false, editing: false, form: emptyMcpForm() })
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ severity: 'error' | 'warning'; message: string } | null>(null)

  const refresh = (): void => {
    setState({ status: 'loading' })
    setFeedback(null)
    void list().then(snapshot => { setState({ status: 'ready', servers: snapshot.servers }) }, error => {
      setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
    })
  }

  useEffect(() => { refresh() }, [list])

  const run = async (operation: () => Promise<McpMutationReceipt>): Promise<void> => {
    setBusy(true)
    setFeedback(null)
    try {
      const receipt = await operation()
      setState({ status: 'ready', servers: receipt.snapshot.servers })
      if (receipt.status === 'failed') setFeedback({ severity: 'error', message: receipt.message ?? t('mcpSaveFailed') })
      else if (receipt.status === 'restart-required' && receipt.message !== null) setFeedback({ severity: 'warning', message: receipt.message })
    } catch (error) {
      setFeedback({ severity: 'error', message: error instanceof Error ? error.message : String(error) })
    } finally {
      setBusy(false)
    }
  }

  const openAdd = (): void => { setEditor({ open: true, editing: false, form: emptyMcpForm() }); setFeedback(null) }
  const openEdit = (server: McpServerRecord): void => { setEditor({ open: true, editing: true, form: formFromRecord(server) }); setFeedback(null) }
  const closeEditor = (): void => { setEditor({ open: false, editing: false, form: emptyMcpForm() }) }

  const submit = (): void => {
    void run(() => save(inputFromForm(editor.form), editor.form.enabled)).then(() => {
      if (editor.form.serverName.trim() !== '') closeEditor()
    })
  }

  if (state.status === 'loading') return <p className={css.message}>{t('loading')}</p>
  if (state.status === 'error') return <div className={css.error} role="alert"><span>{t('error')} <small>{state.message}</small></span><button type="button" onClick={refresh}>{t('retry')}</button></div>

  return <section className={css.panel} aria-label={t('mcpTitle')}>
    <header className={css.toolbar}><h3>{t('mcpTitle')}</h3><button type="button" onClick={openAdd} disabled={busy}>{t('mcpAdd')}</button></header>
    {feedback !== null ? <p className={css.feedback} data-severity={feedback.severity} role={feedback.severity === 'error' ? 'alert' : 'status'}>{feedback.message}</p> : null}
    {state.servers.length === 0 ? <p className={css.message}>{t('mcpEmpty')}</p> : null}
    <ul className={css.list}>
      {state.servers.map(server => <li key={server.serverName}>
        <div className={css.row}>
          <span className={css.name}>{server.serverName}<small>{server.transport === 'stdio' ? server.command : server.url}</small></span>
          <span className={css.badge}>{server.managed ? t('mcpManaged') : t('mcpUnmanaged')}</span>
          <Toggle checked={!server.disabled} disabled={busy} label={t('mcpEnabled')} onChange={() => { void run(() => setEnabled(server.serverName, server.disabled)) }} />
          {server.managed
            ? <><button type="button" disabled={busy} onClick={() => { openEdit(server) }}>{t('mcpEdit')}</button><button type="button" disabled={busy} onClick={() => { if (window.confirm(t('mcpRemoveConfirm'))) void run(() => remove(server.serverName)) }}>{t('mcpRemove')}</button></>
            : null}
        </div>
      </li>)}
    </ul>
    {editor.open ? <FormEditor editor={editor} busy={busy} t={t} onCancel={closeEditor} onSubmit={submit} onChange={form => { setEditor(current => ({ ...current, form })) }} /> : null}
  </section>
}

/** MCP 编辑表单：按传输方式切换字段。 */
function FormEditor(props: {
  editor: Editor
  busy: boolean
  t: (key: LocaleKey) => string
  onCancel: () => void
  onSubmit: () => void
  onChange: (form: McpFormState) => void
}) {
  const { editor, busy, t, onChange } = props
  const set = <K extends keyof McpFormState>(field: K, value: McpFormState[K]): void => { onChange({ ...editor.form, [field]: value }) }
  const text = (label: string, field: keyof McpFormState): ReactNode => (
    <label className={css.field}><span>{label}</span><input type="text" value={String(editor.form[field])} disabled={busy} onChange={event => { set(field, event.currentTarget.value) }} /></label>
  )
  return <div className={css.editor}>
    {text(t('mcpServerName'), 'serverName')}
    <label className={css.field}><span>{t('mcpTransport')}</span><select value={editor.form.transport} disabled={busy} onChange={event => { set('transport', event.currentTarget.value as McpFormState['transport']) }}>
      <option value="stdio">{t('mcpStdio')}</option><option value="streamable-http">{t('mcpHttp')}</option>
    </select></label>
    {editor.form.transport === 'stdio'
      ? <>{text(t('mcpCommand'), 'command')}{text(t('mcpArgs'), 'args')}{text(t('mcpCwd'), 'cwd')}<label className={css.field}><span>{t('mcpEnv')}</span><textarea rows={4} value={editor.form.env} disabled={busy} onChange={event => { set('env', event.currentTarget.value) }} /></label></>
      : <>{text(t('mcpUrl'), 'url')}<label className={css.field}><span>{t('mcpHeaders')}</span><textarea rows={4} value={editor.form.headers} disabled={busy} onChange={event => { set('headers', event.currentTarget.value) }} /></label></>}
    {text(t('mcpTimeout'), 'toolCallTimeoutMs')}
    <label className={css.check}><input type="checkbox" checked={editor.form.enabled} disabled={busy} onChange={event => { set('enabled', event.currentTarget.checked) }} />{t('mcpEnabled')}</label>
    <div className={css.actions}><button type="button" disabled={busy} onClick={props.onCancel}>{t('mcpCancel')}</button><button type="button" disabled={busy || editor.form.serverName.trim() === ''} onClick={props.onSubmit}>{t('mcpSave')}</button></div>
  </div>
}

/** 启用开关。 */
function Toggle({ checked, disabled, label, onChange }: { checked: boolean; disabled: boolean; label: string; onChange: () => void }) {
  return <label className={css.switch} title={label}><input type="checkbox" checked={checked} disabled={disabled} aria-label={label} onChange={onChange} /><span aria-hidden="true" /></label>
}
