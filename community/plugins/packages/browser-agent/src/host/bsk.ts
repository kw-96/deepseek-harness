/**
 * bsk CLI 驱动：本插件唯一的执行面。命令一律以 argv 直连（不经 shell），
 * 因此参数里的引号、中文与 `@eN` 引用都原样传递。
 */

import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import { errorText, parseJsonObject, parseJsonRows, stringField } from './parse.js'

/** 普通命令默认超时（毫秒）。 */
export const DEFAULT_TIMEOUT_MS = 30_000
/** 导航类命令默认超时（毫秒）。 */
export const NAVIGATION_TIMEOUT_MS = 60_000
const STDOUT_MAX_BYTES = 4 * 1024 * 1024
const STDERR_MAX_BYTES = 64 * 1024
/** 子进程退出后残留句柄的排空宽限（毫秒），防止后台 daemon 拖住采集管道。 */
const GRACE_MS = 2_000

/** bsk 退出码 → 中文处置建议（对照 SKILL.md 的退出码表）。 */
const EXIT_HINTS: Readonly<Record<number, string>> = {
  1: '参数或状态错误：确认会话仍活跃、引用来自最新快照',
  2: '协议/传输失败：浏览器扩展未连接或 daemon 不可用，先跑 bsk status / bsk doctor',
  3: '浏览器执行失败：重试或简化选择器，并确认目标标签页仍在',
  4: '命令超时：调大超时，或把等待条件放宽到 domcontentloaded',
  5: 'CLI 与扩展版本不一致：安装配套版本',
}

/** bsk 命令失败（含结构化错误码与原始参数）。 */
export class BskError extends Error {
  readonly code: string | null
  readonly hint: string | null
  readonly exitCode: number | null

  /**
   * @param message - 面向模型的一次性说明
   * @param fields - bsk 返回的错误码、建议与退出码
   */
  constructor(message: string, fields: { code?: string | null; hint?: string | null; exitCode?: number | null }) {
    super(message)
    this.name = 'BskError'
    this.code = fields.code ?? null
    this.hint = fields.hint ?? null
    this.exitCode = fields.exitCode ?? null
  }
}

/** 一次命令的结果。 */
export interface BskOutcome {
  stdout: string
  stderr: string
  exitCode: number | null
  /** 对象形态的 JSON 输出（多数命令）。 */
  json: Record<string, unknown> | undefined
  /** 数组形态的 JSON 输出（`session list`）。 */
  rows?: unknown[] | undefined
}

/** 单次调用的可选项。 */
export interface BskRunOptions {
  timeoutMs?: number
  /** 非零退出不抛错（探测类命令）。 */
  allowFailure?: boolean
  /** 取消信号（来自工具执行）。 */
  signal?: AbortSignal | undefined
}

/**
 * 本插件依赖的 bsk 执行面：会话托管与工具只面向这个接口，
 * 测试可注入脚本化的替身。
 */
export interface BskCommandRunner {
  run(args: readonly string[], options?: BskRunOptions): Promise<BskOutcome>
  ensureDaemon(): Promise<void>
}

/** bsk CLI 进程封装。 */
export class BskRunner implements BskCommandRunner {
  private executablePath: string | undefined
  private daemonStart: Promise<void> | undefined

  /**
   * @param subprocess - 宿主子进程服务
   * @param binary - 可执行文件名或绝对路径（默认 bsk）
   * @param cwd - 子进程工作目录
   * @param log - 诊断日志出口
   */
  constructor(
    private readonly subprocess: SubprocessRuntime,
    private readonly binary: string,
    private readonly cwd: string,
    private readonly log: (message: string) => void = () => {},
    /** 子进程环境覆盖（例如 `BSK_HOME`）；未给时沿用父进程环境。 */
    private readonly env: Readonly<Record<string, string>> | undefined = undefined,
  ) {}

  /**
   * 执行一条命令；失败时抛出带中文建议的 {@link BskError}。
   * @param args - 不含可执行文件的参数
   * @param options - 超时、取消与容错
   * @returns 命令结果（含解析后的 JSON）
   */
  async run(args: readonly string[], options: BskRunOptions = {}): Promise<BskOutcome> {
    const argv = [await this.executable(), ...args]
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const signals = [AbortSignal.timeout(timeoutMs)]
    if (options.signal !== undefined) signals.push(options.signal)
    const signal = signals.length === 1 ? signals[0]! : AbortSignal.any(signals)
    let stdout = ''
    let stderr = ''
    let exitCode: number | null = null
    try {
      const handle = this.subprocess.spawn({
        argv,
        cwd: this.cwd,
        ...(this.env !== undefined ? { env: this.env } : {}),
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: STDOUT_MAX_BYTES },
          stderr: { maxBytes: STDERR_MAX_BYTES },
        },
        graceMs: GRACE_MS,
        signal,
      })
      const outcome = await handle.done
      exitCode = outcome.exitCode
      stdout = handle.collected.stdout?.readFrom(0).text ?? ''
      stderr = handle.collected.stderr?.readFrom(0).text ?? ''
    } catch (error) {
      throw new BskError(`无法执行 ${this.binary}：${errorText(error)}`, {
        hint: '确认 bsk CLI 已安装并在 PATH 上（bsk --version）',
      })
    }
    const json = parseJsonObject(stdout)
    const rows = json === undefined ? parseJsonRows(stdout) : undefined
    if (exitCode !== 0 && options.allowFailure !== true) {
      const aborted = signal.aborted
      const message = stringField(json, 'message')
        ?? (aborted ? `命令超时（${timeoutMs}ms）` : stderr.trim() || `bsk 以退出码 ${String(exitCode)} 结束`)
      throw new BskError(message, {
        code: stringField(json, 'code') ?? null,
        hint: stringField(json, 'hint') ?? (exitCode === null ? '命令被中断或超时' : EXIT_HINTS[exitCode] ?? null),
        exitCode,
      })
    }
    return { stdout, stderr, exitCode, json, ...(rows !== undefined ? { rows } : {}) }
  }

  /**
   * 确保 daemon 已在后台 detach 运行；幂等，失败只记日志。
   * @returns 首次启动完成后的 Promise
   */
  async ensureDaemon(): Promise<void> {
    this.daemonStart ??= this.startDaemon()
    return await this.daemonStart
  }

  private async startDaemon(): Promise<void> {
    try {
      await this.run(['daemon', 'start', '--quiet'], { timeoutMs: DEFAULT_TIMEOUT_MS, allowFailure: true })
    } catch (error) {
      this.log(`browser-agent: daemon 启动失败：${errorText(error)}`)
    }
  }

  private async executable(): Promise<string> {
    if (this.executablePath !== undefined) return this.executablePath
    try {
      this.executablePath = await this.subprocess.resolveExecutable(this.binary)
    } catch (error) {
      throw new BskError(`找不到 bsk 可执行文件（${this.binary}）：${errorText(error)}`, {
        hint: '安装 browser-skill CLI 并确认 bsk 在 PATH 上',
      })
    }
    return this.executablePath
  }
}

