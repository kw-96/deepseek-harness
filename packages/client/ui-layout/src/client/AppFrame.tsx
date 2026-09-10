/**
 * Three-column shell frame with an optional bottom row, registered into the
 * built-in 'root' slot (the web shell renders only 'root'). Owns the grid
 * tracks (sidebar | center | details plus bottom), the drag handles, the concession
 * chain (columns.ts), and the child-slot render decisions: the sidebar slot
 * renders HERE with live parameters from the concession solve, and the
 * session-aware occupants render in fixed column positions; strict entries
 * gate themselves on current-session availability while session-maybe
 * entries retain identity. Pure component: everything arrives
 * through the three framework shares — zero cordis or framework imports,
 * zero self-made hooks.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore,
} from '@deepseek-ai/dsh-client-ui-slots'
import { computeColumns, DETAILS_DEFAULT, SIDEBAR_AUTO_COLLAPSE, SIDEBAR_DEFAULT } from './columns.ts'
import { isDesktopShell } from './desktop/detect.ts'
import { DesktopTitleBar } from './desktop/DesktopTitleBar.tsx'
import { DocumentTitle } from './DocumentTitle.tsx'
import type { createLayoutStore } from './stores.ts'
import css from './AppFrame.module.css'

/** Injected desktop callbacks assembled in apply. */
export type AppFrameInjected = {
  /** Select a session as current (desktop title-bar history / neighbor nav). */
  openSession: (id: SessionId) => void
}

/** Full composed props: runtime share + child-slot render share + store share. */
export type AppFrameProps =
  & PropsRuntime<'root'>
  & PropsRenderSlots<'sidebar' | 'conversation' | 'main' | 'details' | 'rightbar' | 'bottom' | 'shell.overlay'>
  & PropsStore<ReturnType<typeof createLayoutStore>>
  & PropsLocale<'common'>
  & InjectFace<AppFrameInjected>

/** Center column grid item (session-body building block). */
function CenterColumn(props: { children?: ReactNode }) {
  return <div className={css.centerCol}>{props.children}</div>
}

/** Details column grid item; width 0 keeps the subtree mounted (never unmount on close). */
function DetailsColumn(props: { children?: ReactNode }) {
  return <div className={css.detailsCol}>{props.children}</div>
}

/** Bottom panel grid item; height 0 keeps its subtree mounted. */
function BottomColumn(props: { children?: ReactNode }) {
  return <div className={css.bottomCol}>{props.children}</div>
}

/**
 * One drag handle: pointer capture, rAF-throttled dx reports against the drag-start origin.
 * `side` keys the hover-reveal CSS to the owning column.
 */
function DragHandle(props: { side: 'sidebar' | 'details'; left: number; onStart: () => void; onDrag: (dx: number) => void; onEnd: () => void }) {
  const [dragging, setDragging] = useState(false)
  const origin = useRef(0)
  const latest = useRef(0)
  const frame = useRef<number | null>(null)
  const callbacks = useRef({ onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd })
  callbacks.current = { onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd }

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    origin.current = e.clientX
    latest.current = e.clientX
    callbacks.current.onStart()
    setDragging(true)
  }, [])
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    latest.current = e.clientX
    frame.current ??= requestAnimationFrame(() => {
      frame.current = null
      callbacks.current.onDrag(latest.current - origin.current)
    })
  }, [])
  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null }
    callbacks.current.onDrag(latest.current - origin.current)
    setDragging(false)
    callbacks.current.onEnd()
  }, [])

  return (
    <div
      className={css.handle}
      style={{ left: props.left }}
      data-side={props.side}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  )
}

/** Bottom-panel drag handle: pointer capture with rAF-throttled vertical deltas. */
function BottomDragHandle(props: { onStart: () => void; onDrag: (dy: number) => void; onEnd: () => void }) {
  const origin = useRef(0)
  const latest = useRef(0)
  const frame = useRef<number | null>(null)
  const callbacks = useRef(props)
  callbacks.current = props
  const finish = (target: HTMLDivElement, pointerId: number): void => {
    if (!target.hasPointerCapture(pointerId)) return
    target.releasePointerCapture(pointerId)
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null }
    callbacks.current.onDrag(latest.current - origin.current)
    callbacks.current.onEnd()
  }
  return <div className={css.bottomHandle}
    onPointerDown={(event) => {
      event.preventDefault()
      origin.current = event.clientY
      latest.current = event.clientY
      event.currentTarget.setPointerCapture(event.pointerId)
      callbacks.current.onStart()
    }}
    onPointerMove={(event) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
      latest.current = event.clientY
      frame.current ??= requestAnimationFrame(() => { frame.current = null; callbacks.current.onDrag(latest.current - origin.current) })
    }}
    onPointerUp={(event) => { finish(event.currentTarget, event.pointerId) }}
  />
}

/** The three-column frame (see module doc). */
export function AppFrame({
  useStore,
  useSessions,
  usePanelInfo,
  actions,
  renderSlot,
  SessionProvider,
  openSession,
  t,
}: AppFrameProps) {
  const panels = useStore(s => s)
  const detailsSession = useSessions((s) => {
    const current = s.current
    return current !== undefined && s.byId[current]?.blank === false ? current : undefined
  })
  // 官方兼容面：中央面板选择（本地默认 null = 会话视图），'main' 槽按此分发。
  const activePanelId = usePanelInfo(info => info.activePanelId)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [viewport, setViewport] = useState(() => window.innerWidth)

  const lastSession = useRef(detailsSession)
  useLayoutEffect(() => {
    if (detailsSession === undefined) return
    if (lastSession.current !== undefined && lastSession.current !== detailsSession) {
      actions.closeDetails()
    }
    lastSession.current = detailsSession
  }, [actions, detailsSession])

  // Track the frame's own box (not the window): rAF-throttled ResizeObserver.
  useEffect(() => {
    const el = frameRef.current
    /* v8 ignore next -- the ref is always attached by effect time: the frame div renders unconditionally. */
    if (el === null) return
    let raf: number | null = null
    const observer = new ResizeObserver(() => {
      raf ??= requestAnimationFrame(() => {
        raf = null
        const width = el.getBoundingClientRect().width
        if (width > 0) setViewport(width)
      })
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [])

  // Narrow viewports auto-collapse the sidebar; the store mirror keeps
  // toggleSidebar's semantics right (narrow toggles flip the manual
  // re-expand override, stores.ts). Collapsed is decided here, so the
  // solver stays breakpoint-free: a narrow re-expand passes the preference
  // (or the default when the wide preference is closed) and the center
  // absorbs the squeeze.
  const narrow = viewport < SIDEBAR_AUTO_COLLAPSE
  useEffect(() => { actions.setNarrow(narrow) }, [actions, narrow])
  const sidebarCollapsed = narrow ? !panels.narrowExpanded : panels.sidebar === 0
  const sidebarPreference = sidebarCollapsed
    ? 0
    : panels.sidebar === 0 ? SIDEBAR_DEFAULT : panels.sidebar
  const cols = computeColumns(viewport, sidebarPreference, detailsSession === undefined ? 0 : panels.details)
  // 'rightbar' 别名槽的 owner 几何：官方语义要求"正常宽度"（打开时的解析
  // 宽度），本地以 details 列的默认/当前偏好解算——列关闭时面板仍按此宽度
  // 锚定帧右缘滑出（见 ui-sidebar-right 的 .panel 规则）。
  const rightbarNormal = computeColumns(viewport, sidebarPreference, panels.details === 0 ? DETAILS_DEFAULT : panels.details)
  const colsRef = useRef(cols)
  colsRef.current = cols

  // The drag base is the rendered width captured at drag start (grabbing a
  // concession-clamped panel must not jump back to the stored preference);
  // it stays frozen for the whole gesture so dx deltas do not compound.
  const sidebarBase = useRef(0)
  const detailsBase = useRef(0)
  const bottomBase = useRef(0)
  // Track-level transitions pause for the whole gesture: eased tracks would
  // detach the column edge from the pointer (AppFrame.module.css).
  const [dragging, setDragging] = useState(false)
  const onDragEnd = useCallback(() => { setDragging(false) }, [])
  const onSidebarStart = useCallback(() => { sidebarBase.current = colsRef.current.sidebar; setDragging(true) }, [])
  const onDetailsStart = useCallback(() => { detailsBase.current = colsRef.current.details; setDragging(true) }, [])
  const onSidebarDrag = useCallback((dx: number) => {
    actions.setSidebar(sidebarBase.current + dx)
  }, [actions])
  const onDetailsDrag = useCallback((dx: number) => {
    actions.setDetails(detailsBase.current - dx)
  }, [actions])
  const onBottomStart = useCallback(() => { bottomBase.current = panels.bottom; setDragging(true) }, [panels.bottom])
  const onBottomDrag = useCallback((dy: number) => { actions.setBottom(bottomBase.current - dy) }, [actions])
  const productTitle = process.env.DSH_CLIENT_TITLE ?? t('brand.localBuild')
  const desktop = isDesktopShell()
  const toggleDetails = useCallback(() => {
    if (panels.details === 0) actions.openDetails()
    else actions.closeDetails()
  }, [actions, panels.details])
  const toggleBottom = useCallback(() => {
    if (panels.bottom === 0) actions.openBottom()
    else actions.closeBottom()
  }, [actions, panels.bottom])

  const frame = (
    <div
      ref={frameRef}
      className={css.frame}
      style={{ gridTemplateColumns: `${cols.sidebar}px minmax(0, 1fr) ${cols.details}px`, gridTemplateRows: `minmax(0, 1fr) ${detailsSession === undefined ? 0 : panels.bottom}px` }}
      data-sidebar-collapsed={sidebarCollapsed || undefined}
      data-details-collapsed={cols.details === 0 || undefined}
      data-bottom-collapsed={detailsSession === undefined || panels.bottom === 0 || undefined}
      data-dragging={dragging || undefined}
      data-desktop-shell={desktop || undefined}
    >
      <DocumentTitle
        productTitle={productTitle}
        useSessions={useSessions}
        usePanelInfo={usePanelInfo}
      />
      <div className={css.sidebarCol}>
        {/* Render-site slot call with live concession output: a closed
            sidebar keeps the mounted slot at the compact-rail width, and the
            component sees its rendered state as owner params decided here
            (collapsed follows the resolved rail, so a derived auto-collapse
            renders the rail UI too). */}
        {renderSlot('sidebar', {
          collapsed: sidebarCollapsed,
          width: cols.sidebar,
        })}
      </div>
      <>
        {/* Both column occupants stay at fixed tree positions from first
            paint — no loading gate: a bare status line reads worse than
            the shell's own pending rendering. The conversation
            is session-maybe; SessionProvider withholds the strict details
            entry while no session is current. */}
        <CenterColumn>
          {renderSlot('conversation', {})}
          {/* 'main' 别名槽：官方包按 key 注册中央面板；本地无全局面板时
              恒以保留 key 'conversation' 分发，选中全局面板时切换 entryKey。 */}
          {renderSlot('main', {}, { entryKey: activePanelId ?? 'conversation' })}
        </CenterColumn>
        <DetailsColumn>
          <SessionProvider>{renderSlot('details', {})}</SessionProvider>
          {/* 'rightbar' 别名槽：官方 occupant 自带 SessionProvider 门控会话
              内容，面板锚定帧右缘（detailsCol 未定位，包含块是 .frame），
              列关闭时按正常宽度滑出帧外，与本地 details 列互不遮挡。 */}
          {renderSlot('rightbar', {
            width: rightbarNormal.details,
            viewportWidth: viewport,
            canShow: rightbarNormal.details > 0,
          })}
        </DetailsColumn>
        <BottomColumn>
          {panels.bottom > 0 && <BottomDragHandle onStart={onBottomStart} onDrag={onBottomDrag} onEnd={onDragEnd} />}
          <SessionProvider>{renderSlot('bottom', {})}</SessionProvider>
        </BottomColumn>
      </>
      <div className={css.overlayLayer} data-shell-overlay>
        {renderSlot('shell.overlay', {})}
      </div>
      {/* The collapsed rail is fixed-width: no resize handle while closed. */}
      {!sidebarCollapsed && <DragHandle side="sidebar" left={cols.sidebar} onStart={onSidebarStart} onDrag={onSidebarDrag} onEnd={onDragEnd} />}
      {cols.details > 0 && <DragHandle side="details" left={viewport - cols.details} onStart={onDetailsStart} onDrag={onDetailsDrag} onEnd={onDragEnd} />}
    </div>
  )

  if (!desktop) return frame
  return (
    <div className={css.shell} data-desktop-shell>
      <DesktopTitleBar
        t={t}
        sidebarCollapsed={sidebarCollapsed}
        toggleSidebar={() => { actions.toggleSidebar() }}
        toggleDetails={toggleDetails}
        toggleBottom={toggleBottom}
        openBottom={() => { actions.openBottom() }}
        openSession={openSession}
        useSessions={useSessions}
      />
      {frame}
    </div>
  )
}
