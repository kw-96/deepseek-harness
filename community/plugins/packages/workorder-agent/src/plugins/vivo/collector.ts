import { spawn, type ChildProcess } from 'node:child_process'

/** 采集任务状态。 */
export interface CollectState {
  running: boolean
  targets: string[]
  startedAt?: string
  finishedAt?: string
  exitCode?: number
  log: string[]
}

/** 保留的日志行数上限。 */
const MAX_LOG_LINES = 200

/** vivo 采集进程管理：同一时刻只允许一个任务，保留日志尾部。 */
export class VivoCollector {
  private child?: ChildProcess
  private current: CollectState = { running: false, targets: [], log: [] }

  /**
   * @param options 项目目录、Python 解释器与采集脚本
   * @param onFinish 进程结束后的回调，用于同步新产出
   */
  constructor(
    private readonly options: { projectDir: string; python: string; script: string },
    private readonly onFinish?: () => void,
  ) {}

  /**
   * 启动一次采集。
   * @param targets 游戏名列表
   * @returns 是否启动成功及失败原因
   */
  start(targets: string[]): { started: boolean; reason?: string } {
    if (this.current.running) return { started: false, reason: '已有采集任务在运行，请等待完成' }
    const names = targets.map((item) => item.trim()).filter(Boolean)
    if (names.length === 0) return { started: false, reason: '请至少填写一个游戏名' }
    let child: ChildProcess
    try {
      child = spawn(this.options.python, [this.options.script, ...names], {
        cwd: this.options.projectDir,
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      })
    } catch (error) {
      return { started: false, reason: error instanceof Error ? error.message : String(error) }
    }
    this.current = { running: true, targets: names, startedAt: new Date().toISOString(), log: [] }
    this.child = child
    const collect = (chunk: Buffer): void => {
      for (const line of chunk.toString('utf8').split(/\r?\n/)) {
        if (line.trim()) this.append(line.trimEnd())
      }
    }
    child.stdout?.on('data', collect)
    child.stderr?.on('data', collect)
    child.on('error', (error) => {
      this.append(`无法启动采集进程：${error.message}`)
      this.finish(-1)
    })
    child.on('close', (code) => {
      this.append(`采集进程已结束（退出码 ${code ?? '未知'}）`)
      this.finish(code ?? -1)
    })
    return { started: true }
  }

  /** 返回当前任务状态快照。 */
  state(): CollectState {
    return { ...this.current, targets: [...this.current.targets], log: [...this.current.log] }
  }

  /**
   * 终止正在运行的采集进程；采集脚本会自行关闭浏览器上下文。
   * @returns 是否真的终止了任务
   */
  stop(): boolean {
    if (!this.current.running || this.child === undefined) return false
    this.append('已请求停止采集')
    this.child.kill()
    return true
  }

  private append(line: string): void {
    this.current.log.push(line)
    if (this.current.log.length > MAX_LOG_LINES) this.current.log.shift()
  }

  private finish(code: number): void {
    this.current = { ...this.current, running: false, exitCode: code, finishedAt: new Date().toISOString() }
    this.child = undefined
    this.onFinish?.()
  }
}
