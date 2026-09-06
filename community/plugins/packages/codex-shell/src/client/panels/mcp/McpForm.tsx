/**
 * MCP 服务编辑表单：新增或修改一条 mcp-client 配置行。
 * stdio 传输填写命令/参数/环境/工作目录；streamable-http 填写端点/请求头。
 */
import { useState } from 'react'
import { X } from 'lucide-react'
import type { McpServerInputLike, McpServerLike } from '../../RightPanel.js'
import type { TFn } from '../../faces.js'
import css from '../../styles.module.css'

interface McpFormProps {
  t: TFn
  /** null 表示新增；否则用现有行预填。 */
  initial: McpServerLike | null
  busy: boolean
  onCancel: () => void
  onSave: (input: McpServerInputLike, enabled: boolean) => void
}

interface FormFields {
  serverName: string
  transport: 'stdio' | 'streamable-http'
  command: string
  args: string
  env: string
  cwd: string
  url: string
  headers: string
  timeout: string
}

function initialFields(initial: McpServerLike | null): FormFields {
  return {
    serverName: initial?.serverName ?? '',
    transport: initial?.transport ?? 'stdio',
    command: initial?.command ?? '',
    args: (initial?.args ?? []).join(' '),
    env: Object.entries(initial?.env ?? {}).map(([key, value]) => `${key}=${value}`).join('\n'),
    cwd: initial?.cwd ?? '',
    url: initial?.url ?? '',
    headers: Object.entries(initial?.headers ?? {}).map(([key, value]) => `${key}=${value}`).join('\n'),
    timeout: initial === null || initial.toolCallTimeoutMs === null ? '' : String(initial.toolCallTimeoutMs),
  }
}

/** 把 KEY=VALUE 文本行解析为字符串记录；空行忽略。 */
function parseRecord(text: string): Readonly<Record<string, string>> {
  const record: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    const index = trimmed.indexOf('=')
    if (index <= 0) continue
    record[trimmed.slice(0, index)] = trimmed.slice(index + 1)
  }
  return record
}

function parseArgs(text: string): readonly string[] {
  return text.trim() === '' ? [] : text.trim().split(/\s+/)
}

export function McpForm({ t, initial, busy, onCancel, onSave }: McpFormProps) {
  const [fields, setFields] = useState<FormFields>(() => initialFields(initial))
  const [localError, setLocalError] = useState<string | null>(null)

  const set = (patch: Partial<FormFields>): void => { setFields(prev => ({ ...prev, ...patch })) }

  const submit = (): void => {
    const serverName = fields.serverName.trim()
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(serverName)) {
      setLocalError(t('mcpNameInvalid'))
      return
    }
    const timeout = fields.timeout.trim()
    const toolCallTimeoutMs = timeout === '' ? null : Number(timeout)
    if (toolCallTimeoutMs !== null && (!Number.isInteger(toolCallTimeoutMs) || toolCallTimeoutMs <= 0)) {
      setLocalError(t('mcpTimeoutInvalid'))
      return
    }
    if (fields.transport === 'stdio' && fields.command.trim() === '') {
      setLocalError(t('mcpCommandRequired'))
      return
    }
    if (fields.transport === 'streamable-http' && !/^https?:\/\//.test(fields.url.trim())) {
      setLocalError(t('mcpUrlInvalid'))
      return
    }
    const input: McpServerInputLike = {
      serverName,
      transport: fields.transport,
      command: fields.transport === 'stdio' ? fields.command.trim() : null,
      args: fields.transport === 'stdio' ? parseArgs(fields.args) : [],
      env: fields.transport === 'stdio' ? parseRecord(fields.env) : {},
      cwd: fields.transport === 'stdio' && fields.cwd.trim() !== '' ? fields.cwd.trim() : null,
      url: fields.transport === 'streamable-http' ? fields.url.trim() : null,
      headers: fields.transport === 'streamable-http' ? parseRecord(fields.headers) : {},
      toolCallTimeoutMs,
    }
    setLocalError(null)
    onSave(input, initial?.disabled !== true)
  }

  return (
    <aside className={css.pluginDetail} style={{ maxHeight: 'none' }} aria-label={t('mcpFormTitle')}>
      <header className={css.pluginDetailHeader}>
        <span className={css.pluginDetailTitle}>{initial === null ? t('mcpAdd') : t('mcpEditTitle')}</span>
        <button type="button" className={css.iconButton} aria-label={t('mcpFormClose')}
          disabled={busy} onClick={onCancel}>
          <X size={13} />
        </button>
      </header>
      <div className={css.pluginDetailBody}>
        {localError !== null && <p className={css.pluginDetailWarning}>{localError}</p>}
        <div className={css.mcpForm}>
          <label className={css.mcpField}>
            <span>{t('mcpName')}</span>
            <input className={css.textInput} value={fields.serverName} disabled={initial !== null || busy}
              placeholder="my-server" onChange={event => { set({ serverName: event.currentTarget.value }) }} />
          </label>
          <label className={css.mcpField}>
            <span>{t('mcpTransport')}</span>
            <select className={css.textInput} value={fields.transport} disabled={busy}
              onChange={event => { set({ transport: event.currentTarget.value === 'streamable-http' ? 'streamable-http' : 'stdio' }) }}>
              <option value="stdio">stdio</option>
              <option value="streamable-http">streamable-http</option>
            </select>
          </label>
          {fields.transport === 'stdio' ? (
            <>
              <label className={css.mcpField}>
                <span>{t('mcpCommand')}</span>
                <input className={css.textInput} value={fields.command} disabled={busy} placeholder="npx -y @some/mcp"
                  onChange={event => { set({ command: event.currentTarget.value }) }} />
              </label>
              <label className={css.mcpField}>
                <span>{t('mcpArgs')}</span>
                <input className={css.textInput} value={fields.args} disabled={busy} placeholder="arg1 arg2"
                  onChange={event => { set({ args: event.currentTarget.value }) }} />
              </label>
              <label className={css.mcpField}>
                <span>{t('mcpEnv')}</span>
                <textarea className={css.mcpTextarea} value={fields.env} disabled={busy}
                  placeholder={'KEY=VALUE\nKEY2=VALUE2'} onChange={event => { set({ env: event.currentTarget.value }) }} />
              </label>
              <label className={css.mcpField}>
                <span>{t('mcpCwd')}</span>
                <input className={css.textInput} value={fields.cwd} disabled={busy} placeholder="C:/work"
                  onChange={event => { set({ cwd: event.currentTarget.value }) }} />
              </label>
            </>
          ) : (
            <>
              <label className={css.mcpField}>
                <span>{t('mcpUrl')}</span>
                <input className={css.textInput} value={fields.url} disabled={busy} placeholder="https://host/mcp"
                  onChange={event => { set({ url: event.currentTarget.value }) }} />
              </label>
              <label className={css.mcpField}>
                <span>{t('mcpHeaders')}</span>
                <textarea className={css.mcpTextarea} value={fields.headers} disabled={busy}
                  placeholder={'Authorization=Bearer token'} onChange={event => { set({ headers: event.currentTarget.value }) }} />
              </label>
            </>
          )}
          <label className={css.mcpField}>
            <span>{t('mcpTimeout')}</span>
            <input className={css.textInput} value={fields.timeout} disabled={busy} inputMode="numeric" placeholder="60000"
              onChange={event => { set({ timeout: event.currentTarget.value }) }} />
          </label>
        </div>
        <div className={css.pluginDetailActions}>
          <button type="button" className={css.pluginSecondaryButton} disabled={busy} onClick={onCancel}>
            {t('mcpFormCancel')}
          </button>
          <button type="button" className={css.primaryButton} disabled={busy} onClick={submit}>
            {t('mcpFormSave')}
          </button>
        </div>
      </div>
    </aside>
  )
}
