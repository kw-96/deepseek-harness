/**
 * 实时动作跟踪：面板的「正在做什么 + 耗时 + 中断」由这里支撑。
 *
 * 每个 DSH 会话最多记录一个正在执行的工具调用。工具包装器在开始执行时调用
 * `begin()`，它同时给出一个 AbortController 的信号；面板的中断按钮调用
 * `interrupt()`。工具发出的 `bsk` 子进程带的就是这个信号，因此中断会直接杀掉
 * CLI 子进程——daemon 侧据此协同取消，无需额外的 cancel 命令。
 */

/** 一次正在执行的动作。 */
export interface LiveAction {
  /** 工具名，例如 `browser_click`。 */
  toolName: string
  /** 一句话摘要，例如目标引用。 */
  summary: string
  /** 开始时间（毫秒时间戳）。 */
  startedAtMs: number
}

/** 跟踪器的条目。 */
interface Entry {
  action: LiveAction
  controller: AbortController
}

/** 按 DSH 会话跟踪正在执行的动作。 */
export class ActionTracker {
  private readonly entries = new Map<string, Entry>()

  /**
   * 开始记录一次动作。
   * @param sessionId - DSH 会话 id
   * @param toolName - 工具名
   * @param summary - 摘要
   * @param outerSignal - 调用方（宿主）的取消信号
   * @returns 该动作的取消信号，与宿主信号合并
   */
  begin(sessionId: string, toolName: string, summary: string, outerSignal: AbortSignal): AbortSignal {
    const controller = new AbortController()
    this.entries.set(sessionId, {
      action: { toolName, summary, startedAtMs: Date.now() },
      controller,
    })
    return AbortSignal.any([outerSignal, controller.signal])
  }

  /**
   * 结束记录（工具执行返回或抛错都要调用）。
   * @param sessionId - DSH 会话 id
   */
  end(sessionId: string): void {
    this.entries.delete(sessionId)
  }

  /**
   * 读取当前动作。
   * @param sessionId - DSH 会话 id
   * @returns 正在执行的动作；空闲时为 undefined
   */
  current(sessionId: string): LiveAction | undefined {
    return this.entries.get(sessionId)?.action
  }

  /**
   * 中断当前动作。
   * @param sessionId - DSH 会话 id
   * @returns 是否确实中断了一个正在执行的动作
   */
  interrupt(sessionId: string): boolean {
    const entry = this.entries.get(sessionId)
    if (entry === undefined) return false
    entry.controller.abort(new Error('用户从面板中断了该动作'))
    return true
  }

  /** 当前正在执行的动作数量（插件卸载时用于确认已清空）。 */
  get size(): number {
    return this.entries.size
  }
}
