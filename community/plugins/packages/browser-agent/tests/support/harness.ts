/**
 * 工具测试夹具：用只含 tools 注册表的宿主上下文装载全部浏览器工具，
 * 注入脚本化执行器，并提供构造调用与断言的辅助。
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { BrowserPolicy } from '../../src/host/policy.js'
import { BskSessionStore } from '../../src/host/store.js'
import type { ApprovalFace } from '../../src/tools/shared.js'
import { registerBrowserTools } from '../../src/tools/register.js'
import { FakeRunner } from './fake-runner.js'

/** 夹具配置。 */
export interface HarnessOptions {
  allowEvaluate?: boolean
  agent?: boolean
  approval?: 'allowed-once' | 'rejected' | 'unavailable'
  requireApprovalForBorrow?: boolean
  idleTimeoutMs?: number
  browserInstance?: string
}

/** 一次测试用的插件装配结果。 */
export interface Harness {
  runner: FakeRunner
  tools: Map<string, ToolDefinition>
  store: BskSessionStore
  exec: { agent?: { session: { id: string } }, signal: AbortSignal }
  commandHeads: () => string[]
  /** 释放全部 effect（等价于插件卸载）。 */
  dispose: () => void
}

/**
 * 建立夹具。
 * @param options - 开关与审批脚本
 * @returns 夹具
 */
export function makeHarness(options: HarnessOptions = {}): Harness {
  const runner = new FakeRunner()
  const tools = new Map<string, ToolDefinition>()
  const disposers: Array<() => void> = []
  const ctx = {
    tools: {
      register: (definition: ToolDefinition) => {
        tools.set(definition.name, definition)
        return () => { tools.delete(definition.name) }
      },
    },
    // 复刻 cordis 的最小语义：effect 立即执行并把返回的释放器交给 fiber。
    effect: (callback: () => unknown) => {
      const disposer = callback()
      if (typeof disposer === 'function') disposers.push(disposer as () => void)
      return () => {
        if (typeof disposer === 'function') (disposer as () => void)()
        disposers.splice(disposers.indexOf(disposer as () => void), 1)
      }
    },
  } as unknown as Context
  const store = new BskSessionStore(runner, {
    idleTimeoutMs: options.idleTimeoutMs ?? 60_000,
    snapshotMaxChars: 1000,
    browserInstance: options.browserInstance ?? '',
    log: () => {},
  })
  const approval: ApprovalFace | undefined = options.approval === undefined ? undefined : {
    request: async () => options.approval ?? 'unavailable',
  }
  registerBrowserTools(ctx, {
    runner,
    store,
    policy: new BrowserPolicy({
      allowEvaluate: options.allowEvaluate ?? false,
      sensitivePatterns: ['login'],
      allowedPatterns: [],
    }),
    config: {
      actionTimeoutMs: 1000,
      navigationTimeoutMs: 2000,
      screenshotDir: '',
      requireApprovalForBorrow: options.requireApprovalForBorrow ?? true,
    },
    ...(approval !== undefined ? { approval } : {}),
  })
  const exec: Harness['exec'] = { signal: new AbortController().signal }
  if (options.agent !== false) exec.agent = { session: { id: 'sess-1' } }
  return {
    runner,
    tools,
    store,
    exec,
    // `browsers` 是会话建立前的基础设施探测，不计入行为断言（由 host.spec 覆盖）。
    commandHeads: () => runner.commands
      .map(command => command.args[0] ?? '')
      .filter(head => head !== 'browsers' && head !== 'daemon'),
    dispose: () => { for (const disposer of [...disposers]) disposer() },
  }
}

/**
 * 调用一个已注册工具。
 * @param harness - 夹具
 * @param name - 工具名
 * @param args - 工具参数
 * @returns 工具的规范化返回值
 */
export async function call(harness: Harness, name: string, args: unknown): Promise<Record<string, unknown>> {
  const tool = harness.tools.get(name)
  if (tool === undefined) throw new Error(`未注册工具：${name}`)
  return await tool.execute(args, harness.exec as never) as Record<string, unknown>
}
