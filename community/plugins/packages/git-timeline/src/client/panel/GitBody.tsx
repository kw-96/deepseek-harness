/** Git 面板标签体：Changes 区（上半） + Graph 区（下半） + 固定底部栏。 */

import { BottomBar } from './BottomBar.js'
import { Changes } from './Changes.js'
import { Graph } from './Graph.js'
import { useGitPanel } from '../controller/useGitPanel.js'
import type { GitBodyRuntimeProps, GitPanelApi, TFn, WorkspaceChangeFace } from '../lib/faces.js'
import css from './styles.module.css'

export interface GitBodyInjected {
  api: GitPanelApi
  /** 会话文件变更流（可选）：把自动刷新挂在真实写入上。 */
  files?: WorkspaceChangeFace
}

export interface GitBodyProps extends GitBodyRuntimeProps, GitBodyInjected {
  t: TFn
}

/**
 * Git 面板标签体。
 * @param props 会话运行时 props、注入的 git 面与文案
 */
export function GitBody({ sessionId, useSessions, t, api, files }: GitBodyProps): React.ReactNode {
  const cwd = useSessions(state => state.byId[sessionId]?.cwd)
  const panel = useGitPanel({ sessionId, cwd, t, api, files })

  if (cwd === undefined) return <div className={css.empty}>{t('notRepo')}</div>
  if (panel.status !== null && !panel.status.repo) return <div className={css.empty}>{t('notRepo')}</div>

  return (
    <div className={css.root}>
      <Changes
        t={t}
        status={panel.status}
        message={panel.message}
        onMessage={panel.setMessage}
        generating={panel.generating}
        onGenerate={panel.generate}
        action={panel.action}
        onAction={panel.chooseAction}
        busy={panel.busy}
        onCommit={panel.commitNow}
        onStage={entry => { panel.toggleStage(entry, 'stage') }}
        onUnstage={entry => { panel.toggleStage(entry, 'unstage') }}
        onDiscard={panel.discardEntry}
        onStageAll={panel.stageAll}
        onUnstageAll={panel.unstageAll}
        openDiff={panel.openDiff}
        diff={panel.diff}
        onOpenDiff={panel.openEntryDiff}
        onCloseDiff={panel.closeDiff}
      />
      {(panel.error !== null || panel.notice !== null) && (
        <div className={panel.error === null ? css.notice : css.error} onClick={panel.clearMessage}>
          {panel.error ?? panel.notice}
        </div>
      )}
      <Graph
        t={t}
        log={panel.log}
        branch={panel.status?.branch ?? null}
        busy={panel.busy}
        locateSignal={panel.locateSignal}
        openCommit={panel.openCommit}
        detail={panel.detail}
        openFile={panel.openCommitFile}
        fileDiff={panel.commitDiff}
        onOpenCommit={panel.openCommitDetail}
        onCloseDetail={panel.closeCommitDetail}
        onToggleFile={panel.toggleCommitFile}
        onLocate={panel.locate}
        onFetch={() => { panel.runAction('fetch') }}
        onPull={() => { panel.runAction('pull') }}
        onPush={() => { panel.runAction('push') }}
        onRefresh={() => { panel.runAction('refresh') }}
      />
      <BottomBar
        t={t}
        branch={panel.status?.branch ?? null}
        ahead={panel.status?.ahead ?? 0}
        behind={panel.status?.behind ?? 0}
        identity={panel.identity}
        workspaceName={panel.workspaceName}
        busy={panel.busy}
        branchNames={panel.branchNames}
        branchMenuOpen={panel.branchMenuOpen}
        onToggleBranchMenu={panel.toggleBranchMenu}
        onCheckout={panel.checkoutBranch}
        onCreateBranch={panel.createBranch}
        onSaveIdentity={panel.saveIdentity}
        onRefresh={() => { panel.runAction('refresh') }}
      />
    </div>
  )
}
