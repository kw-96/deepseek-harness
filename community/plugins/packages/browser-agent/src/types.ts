/**
 * 插件对外值类型：Host 工具、Remote 面板与 Client 共用同一份
 * 定义，Remote 线协议用 zod schema 校验。
 */

import { z } from 'zod'

/** bsk 会话状态机。 */
export const SESSION_STATES = ['idle', 'open', 'stopped', 'error'] as const

const instanceSchema = z.object({
  instanceId: z.string(),
  browserName: z.string(),
  label: z.string(),
  extensionVersion: z.string(),
  versionSkew: z.boolean(),
})

const tabSchema = z.object({
  tabId: z.string(),
  url: z.string(),
  title: z.string(),
  scope: z.union([z.literal('user'), z.literal('agent')]),
})

const sessionSchema = z.object({
  sessionId: z.string(),
  bskSessionId: z.string().nullable(),
  state: z.union([z.literal('idle'), z.literal('open'), z.literal('stopped'), z.literal('error')]),
  currentUrl: z.string().nullable(),
  pageTitle: z.string().nullable(),
  tabCount: z.number().int(),
  lastActionAtMs: z.number(),
  idleDeadlineAtMs: z.number().nullable(),
  lastError: z.string().nullable(),
})

export const browserPanelValue = z.object({
  session: sessionSchema,
  browsers: z.array(instanceSchema),
  tabs: z.array(tabSchema),
  lastScreenshotPath: z.string().nullable(),
})

export const browserStopValue = z.object({
  stopped: z.boolean(),
  message: z.string(),
})

export const browserLiveValue = z.object({
  sessionOpen: z.boolean(),
  running: z.boolean(),
  toolName: z.string(),
  summary: z.string(),
  startedAtMs: z.number(),
  elapsedMs: z.number().int(),
  currentUrl: z.string(),
  pageTitle: z.string(),
  lastActionAtMs: z.number(),
  idleDeadlineAtMs: z.number().nullable(),
})

export const browserInterruptValue = z.object({
  interrupted: z.boolean(),
  message: z.string(),
})

export const browserPreviewValue = z.object({
  dataUrl: z.string().nullable(),
  path: z.string().nullable(),
  bytes: z.number().int(),
  message: z.string().nullable(),
})

/** 浏览器实例（`bsk browsers --json` 投影）。 */
export type BrowserInstanceView = z.infer<typeof instanceSchema>
/** 标签页（`bsk tab list --json` 投影）。 */
export type BrowserTabView = z.infer<typeof tabSchema>
/** 一个 DSH 会话对应的 bsk 会话视图。 */
export type BrowserSessionView = z.infer<typeof sessionSchema>
/** 右侧面板一次拉取的完整快照。 */
export type BrowserPanelSnapshot = z.infer<typeof browserPanelValue>
/** 面板「结束会话」结果。 */
export type BrowserStopResult = z.infer<typeof browserStopValue>
/** 面板截图预览（data URL 有大小上限）。 */
export type BrowserPreviewResult = z.infer<typeof browserPreviewValue>
/** 面板实时视图：当前动作、耗时与会话状态。 */
export type BrowserLiveView = z.infer<typeof browserLiveValue>
/** 面板中断结果。 */
export type BrowserInterruptResult = z.infer<typeof browserInterruptValue>
