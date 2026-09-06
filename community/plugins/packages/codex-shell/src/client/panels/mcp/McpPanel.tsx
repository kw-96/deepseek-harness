/**
 * MCP 服务管理面板：列出 profile 中的 mcp-client 配置行，增删改查 + 启停。
 * 未托管（用户手写）行只读展示；所有写操作走 pluginManager 命名空间远端。
 */
import { useCallback, useEffect, useState } from 'react'
import { Plus, RefreshCw, ShieldCheck } from 'lucide-react'
import type { CodexMcpManager, McpServerInputLike, McpServerLike } from '../../RightPanel.js'
import type { TFn } from '../../faces.js'
import { McpForm } from './McpForm.js'
import css from '../../styles.module.css'

interface McpPanelProps {
  mcpManager: CodexMcpManager | undefined
  t: TFn
}

interface McpState {
  servers: readonly McpServerLike[] | null
  error: string | null
  notice: string | null
}

export function McpPanel({ mcpManager, t }: McpPanelProps) {
  const [state, setState] = useState<McpState>({ servers: null, error: null, notice: null })
  const [busy, setBusy] = useState(false)
  const [busyName, setBusyName] = useState<string | null>(null)
  const [editing, setEditing] = useState<McpServerLike | 'new' | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    if (mcpManager === undefined) return
    setBusy(true)
    try {
      const result = await mcpManager.listMcpServers()
      setState(prev => ({
        servers: result.ok ? result.value.servers : prev.servers,
        error: result.ok ? null : result.error.message,
        notice: null,
      }))
    } catch (error) {
      setState(prev => ({ ...prev, error: error instanceof Error ? error.message : String(error) }))
    } finally {
      setBusy(false)
    }
  }, [mcpManager])

  useEffect(() => { void refresh() }, [refresh])

  if (mcpManager === undefined) {
    return <div className={css.empty}>{t('mcpManagerMissing')}</div>
  }

  const adopt = (receipt: { status: string; message: string | null; snapshot: { servers: readonly McpServerLike[] } }): void => {
    setState({
      servers: receipt.snapshot.servers,
      error: receipt.status === 'failed' ? receipt.message : null,
      notice: receipt.status === 'failed' ? null : receipt.message,
    })
  }

  const save = async (input: McpServerInputLike, enabled: boolean): Promise<void> => {
    if (mcpManager === undefined) return
    setBusyName(input.serverName)
    const result = await mcpManager.saveMcpServer(input, enabled)
    setBusyName(null)
    if (result.ok) {
      adopt(result.value)
      setEditing(null)
    } else {
      setState(prev => ({ ...prev, error: result.error.message }))
    }
  }

  const toggle = async (server: McpServerLike): Promise<void> => {
    if (mcpManager === undefined || !server.managed) return
    setBusyName(server.serverName)
    const result = await mcpManager.setMcpServerEnabled(server.serverName, server.disabled)
    setBusyName(null)
    if (result.ok) adopt(result.value)
    else setState(prev => ({ ...prev, error: result.error.message }))
  }

  const remove = async (server: McpServerLike): Promise<void> => {
    if (mcpManager === undefined || !server.managed) return
    setBusyName(server.serverName)
    const result = await mcpManager.removeMcpServer(server.serverName)
    setBusyName(null)
    setConfirmRemove(null)
    if (result.ok) adopt(result.value)
    else setState(prev => ({ ...prev, error: result.error.message }))
  }

  return (
    <>
      <div className={css.header} style={{ borderBottom: 'none' }}>
        <span className={css.title}>{t('panelMcp')}{state.servers === null ? '' : ` (${state.servers.length})`}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className={css.iconButton} aria-label={t('mcpAdd')} title={t('mcpAdd')}
            disabled={busy} onClick={() => { setEditing('new') }}>
            <Plus size={13} />
          </button>
          <button type="button" className={css.iconButton} aria-label={t('pluginRefresh')} title={t('pluginRefresh')}
            disabled={busy} onClick={() => { void refresh() }}>
            <RefreshCw size={13} className={busy ? css.spin : undefined} />
          </button>
        </div>
      </div>
      {state.error !== null && <div className={css.error}>{state.error}</div>}
      {state.notice !== null && <div className={css.notice} role="status">{state.notice}</div>}
      {editing !== null && (
        <McpForm
          t={t}
          initial={editing === 'new' ? null : editing}
          busy={busyName !== null}
          onCancel={() => { setEditing(null) }}
          onSave={(input, enabled) => { void save(input, enabled) }}
        />
      )}
      <div className={css.pluginList} role="list" aria-label={t('panelMcp')}>
        {state.servers === null ? <div className={css.empty}>{t('pluginLoading')}</div> : null}
        {state.servers !== null && state.servers.length === 0
          ? <div className={css.empty}>{t('mcpEmpty')}</div>
          : null}
        {state.servers?.map(server => (
          <section key={server.id} className={css.mcpRow} role="listitem" aria-label={`${server.serverName} ${server.transport}`}>
            <div className={css.mcpRowBody}>
              <span className={css.mcpRowTitle}>
                <strong>{server.serverName}</strong>
                {!server.managed && <ShieldCheck size={12} aria-label={t('mcpUnmanaged')} />}
              </span>
              <code>{server.transport === 'stdio' ? (server.command ?? '') : (server.url ?? '')}</code>
              <small data-kind={server.disabled ? 'stopped' : 'running'}>
                {server.disabled ? t('pluginStopped') : t('pluginEnabled')}
              </small>
            </div>
            <span className={css.mcpRowActions}>
              {server.managed && confirmRemove === server.serverName ? (
                <>
                  <button type="button" className={css.pluginSecondaryButton}
                    disabled={busyName !== null} onClick={() => { setConfirmRemove(null) }}>
                    {t('mcpRemoveCancel')}
                  </button>
                  <button type="button" className={css.mcpDangerButton}
                    disabled={busyName !== null} onClick={() => { void remove(server) }}>
                    {t('mcpRemoveConfirm')}
                  </button>
                </>
              ) : (
                <>
                  <button type="button"
                    className={server.disabled ? css.pluginSecondaryButton : css.primaryButton}
                    disabled={!server.managed || busyName !== null}
                    onClick={() => { void toggle(server) }}>
                    {server.disabled ? t('pluginEnable') : t('pluginDisable')}
                  </button>
                  <button type="button" className={css.pluginSecondaryButton}
                    disabled={!server.managed || busyName !== null}
                    onClick={() => { setEditing(server) }}>
                    {t('mcpEdit')}
                  </button>
                  <button type="button" className={css.mcpDangerButton}
                    disabled={!server.managed || busyName !== null}
                    onClick={() => { setConfirmRemove(server.serverName) }}>
                    {t('mcpRemove')}
                  </button>
                </>
              )}
            </span>
          </section>
        ))}
      </div>
    </>
  )
}
