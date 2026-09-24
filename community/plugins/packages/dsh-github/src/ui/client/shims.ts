/**
 * Type bridge to the dsh client plane (ADR-0008). The dsh client runtime
 * packages are registry-restricted, so this module declares the minimal
 * service surface the client half consumes — `ctx.slots`, `ctx.sessions`,
 * and `ctx.remote`. DELETE this module when the package migrates into the
 * dsh workspace and import the real service types
 * (`@deepseek-ai/dsh-client-runtime`, `@deepseek-ai/dsh-api-remotes`)
 * instead; the shapes below mirror theirs member for member.
 * @module dsh-github/ui/client/shims
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ReactNode } from 'react'
import type { TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'

/** The slot options subset this plugin registers with. */
export interface ClientSlotOptions {
  readonly name: string
  readonly id: string
  readonly order: number
}

/** Runtime props a slot component receives (session-scope slots carry the id). */
export interface ClientSlotProps {
  readonly sessionId?: string
}

/** `ctx.slots` — the dsh client slot registry (`SlotRegistry`). */
export interface ClientSlotRegistry {
  /**
   * Contribute one component to a slot.
   * @param options - target slot, list identity, and ordering.
   * @param component - the slot component.
   * @returns the registration's disposer.
   */
  register(options: ClientSlotOptions, component: (props: ClientSlotProps) => ReactNode): () => void
  /**
   * Register once the slot is declared, re-running across re-declarations.
   * @param key - the awaited slot key.
   * @param callback - performs the registration, returning its disposer.
   * @returns the injection's disposer.
   */
  inject(key: string, callback: () => () => void): () => void
}

/** A text prompt part — all this plugin ever sends. */
export interface ClientPromptTextPart {
  readonly type: 'text'
  readonly text: string
}

/**
 * The outward session face slice this plugin drives (`ISession`): the
 * [AI review] and [Create PR] buttons' prompt verb.
 */
export interface ClientSessionFace {
  /**
   * Send a prompt into the session.
   * @param content - the prompt parts.
   * @param mode - `queue` appends a turn; `steer` interrupts the running one.
   */
  prompt(content: readonly ClientPromptTextPart[], mode: 'queue' | 'steer'): Promise<unknown>
}

/**
 * `ctx.sessions` — the dsh client session addressing service (`ISessions`
 * slice). Both verbs live on this already-injected service; the scoped
 * context stays an opaque handle — property-accessing services on it would
 * re-enter the inject check this plugin cannot satisfy (same rule as
 * ADR-0008's remote namespace).
 */
export interface ClientSessions {
  /**
   * Resolve one session's Agent-scoped context.
   * @param sessionId - the target session.
   * @returns the scoped context, or undefined for an unknown session.
   */
  scope(sessionId: string): object | undefined
  /**
   * Resolve the session face behind an Agent-scoped context.
   * @param ctx - a context returned by {@link scope}.
   * @returns the face, or undefined when the scope was pruned.
   */
  sessionOf(ctx: object): ClientSessionFace | undefined
}

/** The client-plane services the dsh web shell provides to this plugin. */
export interface ClientServices {
  /** `ctx.slots` — the dsh client slot registry (`SlotRegistry`). */
  readonly slots: ClientSlotRegistry
  /** `ctx.sessions` — the dsh client session addressing service (`ISessions`). */
  readonly sessions: ClientSessions
  /** `ctx.remote` — the Typert Client Remote (`$mount` / `$on`). */
  readonly remote: TypertClientRemote
}

/** The client plugin's context: the cordis context plus the three client services. */
export type ClientContext = Context & ClientServices

/**
 * 把插件的 cordis context 视为 client 面。
 *
 * 这里**刻意**用收窄断言，而不是像合并前那样用
 * `declare module '@deepseek-ai/cordis'` 做声明合并：合并成单包后，宿主面与
 * client 面编进同一个 TypeScript program，宿主面经 `@deepseek-ai/dsh-session`
 * 把 `Context.sessions` 声明为宿主侧的 `SessionStore`，此处再声明合并一份
 * client 侧的 `sessions` 会触发 TS2717（同名属性两份声明类型必须一致）。断言
 * 方向是「源类型 → 其子类型」（`ClientContext` 是 `Context` 的子类型），方向
 * 合法，运行期恒等——编译产物里只是原样返回，属性读取路径与合并前逐字一致。
 * 这是有意为之的设计取舍，不是随手 `as`；也不要改成 `as any` / `as unknown as`。
 * @param ctx - the cordis context the client loader hands to `apply`.
 * @returns the same context, typed with the three client services.
 */
export function clientContext(ctx: Context): ClientContext {
  return ctx as ClientContext
}
