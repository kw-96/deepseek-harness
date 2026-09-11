/**
 * 工具注册总入口：把四组工具挂到 ctx.tools 上。每个 register 都返回
 * 释放器并由 ctx.tools 自身绑定到当前 fiber，插件卸载时自动注销。
 */

import type { Context } from '@deepseek-ai/cordis'
import { registerControlTools } from './control.js'
import { registerInteractTools } from './interact.js'
import { registerNavigateTools } from './navigate.js'
import { registerObserveTools } from './observe.js'
import type { BrowserToolDeps } from './shared.js'

/**
 * 注册本插件的全部模型工具。
 * @param ctx - 宿主上下文（提供 tools 注册表）
 * @param deps - 工具依赖
 */
export function registerBrowserTools(ctx: Context, deps: BrowserToolDeps): void {
  registerObserveTools(ctx, deps)
  registerInteractTools(ctx, deps)
  registerNavigateTools(ctx, deps)
  registerControlTools(ctx, deps)
}
