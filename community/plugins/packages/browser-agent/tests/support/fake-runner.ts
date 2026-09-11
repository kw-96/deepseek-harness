/**
 * 脚本化的 bsk 执行面替身：记录收到的命令，按预设脚本返回结果，
 * 用于在没有真实浏览器的情况下覆盖会话托管与工具编排。
 */

import type { BskCommandRunner, BskOutcome, BskRunOptions } from '../../src/host/bsk.js'
import { BskError } from '../../src/host/bsk.js'

/** 一条被记录的命令。 */
export interface RecordedCommand {
  args: readonly string[]
  options: BskRunOptions | undefined
}

/** 替身执行器。 */
export class FakeRunner implements BskCommandRunner {
  /** 按顺序记录的全部命令。 */
  readonly commands: RecordedCommand[] = []
  /** daemon 保障调用次数。 */
  daemonCalls = 0
  /** 每条命令的应答；返回 Error 时按失败抛出。 */
  responder: (args: readonly string[]) => BskOutcome | Error = args => defaultOutcome(args)

  run(args: readonly string[], options?: BskRunOptions): Promise<BskOutcome> {
    this.commands.push({ args, options })
    const response = this.responder(args)
    return response instanceof Error ? Promise.reject(response) : Promise.resolve(response)
  }

  ensureDaemon(): Promise<void> {
    this.daemonCalls += 1
    return Promise.resolve()
  }

  /** 会话启动之后发出的命令（去掉会话前缀）。 */
  get toolCommands(): readonly string[] {
    return this.commands
      .filter(command => command.args[0] !== 'session' && command.args[0] !== 'daemon')
      .map(command => command.args[0] ?? '')
  }
}

/**
 * 默认应答：覆盖本插件实际用到的命令形状。
 * @param args - 命令参数
 * @returns 与真实 bsk 一致的输出形状
 */
/** 已启动的会话计数（多会话测试需要唯一的 bsk 会话 id）。 */
let startedSessions = 0

export function defaultOutcome(args: readonly string[]): BskOutcome {
  const head = args[0]
  const sessionId = args.includes('--session') ? args[args.indexOf('--session') + 1] ?? 'aaaa' : 'aaaa'
  if (head === 'session' && args[1] === 'start') {
    // 每次启动给出唯一 id：多会话下两个会话必须是两条不同记录。
    startedSessions += 1
    return ok({ agent_window_id: startedSessions, browser_instance_id: 'test', session_id: `bsk-${String(startedSessions)}` })
  }
  if (head === 'session' && args[1] === 'stop') {
    return ok({ failed: [], return_failures: [], returned_tab_ids: [], stopped: [sessionId] })
  }
  if (head === 'session' && args[1] === 'list') {
    return { stdout: '[]', stderr: '', exitCode: 0, json: undefined, rows: [] }
  }
  if (head === 'browsers') {
    return {
      stdout: '',
      stderr: '',
      exitCode: 0,
      json: {
        browsers: [{
          instance_id: 'test', browser_name: 'edge', browser_version: '152', extension_version: '0.1.2',
          label: 'unit', session_count: 0, connected_at_ms: 0, version_skew: false,
        }],
      },
    }
  }
  if (head === 'navigate') {
    return ok({ tab_id: 7, url: args[1] ?? '', final_url: args[1] ?? '', reached: 'load' })
  }
  if (head === 'snapshot') {
    return ok({
      text: '@e1 RootWebArea "示例页"\n  @e2 button "提交"\n',
      ref_count: 2,
      tab_id: 7,
      truncated: false,
    })
  }
  if (head === 'tab' && args[1] === 'list') {
    return ok({ tabs: [{ tab_id: 7, title: '示例页', url: 'https://example.com/', window_id: 1, active: true, scope: 'agent' }] })
  }
  if (head === 'status') {
    return ok({
      daemon_version: '0.1.6',
      browsers: [{
        instance_id: 'test', browser_name: 'edge', browser_version: '152', extension_version: '0.1.2',
        label: 'unit', session_count: 0, connected_at_ms: 0, version_skew: false,
      }],
    })
  }
  if (head === 'screenshot') {
    return ok({ path: 'C:/tmp/shot.png', byte_size: 1024, format: 'png', width: 100, height: 50, tab_id: 7 })
  }
  if (head === 'get-html') {
    return ok({ html: '<html><body>hi</body></html>' })
  }
  if (head === 'hover') {
    return ok({ tab_id: 7, used_ref: 'e1', x: 240, y: 192 })
  }
  if (head === 'evaluate') {
    return ok({ ok: true, tab_id: 7, value: 'BUTTON' })
  }
  return ok({})
}

/** 构造一次成功结果。 */
function ok(json: Record<string, unknown>): BskOutcome {
  return { stdout: JSON.stringify(json), stderr: '', exitCode: 0, json }
}

/**
 * 构造一个带结构化错误码的失败。
 * @param code - bsk 错误码
 * @param message - 错误说明
 * @param exitCode - 退出码
 * @returns 可抛出的错误
 */
export function failure(code: string, message: string, exitCode = 3): BskError {
  return new BskError(message, { code, hint: '测试替身注入的失败', exitCode })
}
