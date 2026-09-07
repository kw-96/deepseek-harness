import { getRequestListener } from '@hono/node-server'
import { Hono } from 'hono'
import type { Context } from '@deepseek-ai/cordis'
import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import { createApp, type AppRuntime } from '../app.js'
import type { AppConfig } from '../config.js'
import { HarnessWorkorderAgent } from './agent.js'
import { controlPanelNavigationScript } from './navigation.js'
import { toAppConfig, type PluginConfig } from './pluginConfig.js'

/** 工单插件运行时：启用时挂载控制面、调度与 Webhook，禁用时完整卸载。 */
export class WorkorderPluginLifecycle {
  private runtime?: AppRuntime
  private agentRouter?: HarnessWorkorderAgent
  private unregister?: () => void
  private active = false
  private lastKey?: string
  private queue: Promise<void> = Promise.resolve()

  /**
   * @param ctx 拥有 WebServer 的插件上下文
   */
  constructor(private readonly ctx: Context) {
    this.ctx.on('webserver/index-inject', (table: IndexInjection[]) => {
      if (!this.active) return
      table.push({ kind: 'script', placement: 'body', text: controlPanelNavigationScript() })
    })
  }

  /**
   * 按最新配置启停运行时；相同配置跳过。
   * @param config 当前生效的插件配置
   */
  apply(config: PluginConfig): Promise<void> {
    this.queue = this.queue.then(() => this.applyNow(config), () => this.applyNow(config))
    return this.queue
  }

  /** 停止业务运行时并撤掉路由。 */
  stop(): Promise<void> {
    this.lastKey = undefined
    this.queue = this.queue.then(() => this.stopNow(), () => this.stopNow())
    return this.queue
  }

  private async applyNow(config: PluginConfig): Promise<void> {
    const key = JSON.stringify(config)
    if (key === this.lastKey) return
    await this.stopNow()
    this.lastKey = key
    if (!config.enabled) return
    await this.startNow(config)
  }

  private async startNow(config: PluginConfig): Promise<void> {
    let appConfig: AppConfig
    try {
      appConfig = toAppConfig(config)
    } catch (error) {
      console.error('工单插件启动失败：配置不完整', error)
      return
    }
    const agentRouter = new HarnessWorkorderAgent(this.ctx)
    let runtime: AppRuntime | undefined
    let unregister: (() => void) | undefined
    try {
      runtime = await createApp(appConfig, agentRouter)
      const gateway = new Hono()
      gateway.get('/workorder-agent/', (context) => context.redirect('/workorder-agent'))
      gateway.route('/workorder-agent', runtime.app)
      const listener = getRequestListener(gateway.fetch, { hostname: this.ctx.webServer.host })
      unregister = this.ctx.webServer.register({
        kind: 'prefix',
        path: '/workorder-agent',
        handler: listener,
      })
      this.runtime = runtime
      this.agentRouter = agentRouter
      this.unregister = unregister
      this.active = true
    } catch (error) {
      unregister?.()
      await runtime?.close()
      await agentRouter.close()
      console.error('工单插件启动失败', error)
    }
  }

  private async stopNow(): Promise<void> {
    this.active = false
    this.unregister?.()
    this.unregister = undefined
    const runtime = this.runtime
    const agentRouter = this.agentRouter
    this.runtime = undefined
    this.agentRouter = undefined
    try {
      await runtime?.close()
    } finally {
      await agentRouter?.close()
    }
  }
}
