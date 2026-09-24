/**
 * Function plugin wiring the {@link RestGitHubProvider} into `ctx.github`.
 * The token resolves per operation through the optional credentials seam with
 * a process-environment fallback (the CLI path: exporting `GITHUB_TOKEN` just
 * works). The config stores the credential REFERENCE, never a token value.
 *
 * 配置变更由框架负责：Loader 用本插件的 Config schema 校验变更后的配置，
 * 再重启本插件（本插件没有声明 volatile 字段，因此走的是普通重挂载路径），
 * `apply` 每次拿到的都是当前生效的配置，provider 也就在每次操作时读到它。
 *
 * NO default export — the dsh Loader drops `inject` from default-exported
 * function plugins (engineering gate §8).
 * @module dsh-github-rest
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { GitHubError } from 'dsh-github'
import { RestGitHubProvider, type ResolvedRestConfig } from './provider.js'

export { PROVIDER_ID, RestGitHubProvider } from './provider.js'
export type { ResolvedRestConfig, RestGitHubProviderOptions } from './provider.js'
export { buildUrl, MAX_PAGES, parseLinkNext, restPaginate, restRequest, restTextRequest } from './http.js'
export type { RestPageResult, RestRequestOptions, RestResponse, RestTransport } from './http.js'

/** Plugin config; one resolved section per operation, identical to the provider's own config type. */
export type GitHubRestConfig = ResolvedRestConfig

/** Cordis plugin name. */
export const name = 'github-rest'
/** The seam this provider registers into. The optional credentials seam is read via `ctx.get`. */
export const inject = ['github']

/**
 * Config schema. `credentialRef` names an environment variable — a reference,
 * resolved through the credentials seam or the process environment, never a
 * secret itself — so configuration documents stay free of token values.
 *
 * 显式标注 `z<GitHubRestConfig>`：Schemastery 的 schema 实例类型无法在本包内
 * 命名，省略标注会让声明产物引用到不可移植的依赖路径（TS2742）。
 */
export const Config: z<GitHubRestConfig> = z.object({
  credentialRef: z.string().default('GITHUB_TOKEN'),
  baseURL: z.string().default('https://api.github.com'),
})

/**
 * Mount the REST provider: per-operation credential resolution and registry
 * membership (an effect riding this plugin's fiber).
 * @param ctx - plugin context carrying `ctx.github`.
 * @param config - resolved plugin config (schema defaults applied).
 */
export function apply(ctx: Context, config: GitHubRestConfig): void {
  const provider = new RestGitHubProvider({
    // 配置是本次 apply 生效的那一份：Loader 在配置变更时重启本插件并重新传入。
    config: () => config,
    resolveToken: ref => resolveToken(ctx, ref),
    tokenConfigured: ref => ctx.get('credentials') !== undefined || envToken(ref) !== undefined,
  })
  ctx.github.registerProvider(provider)
}

/**
 * Resolve the credential reference for ONE operation: the credentials seam
 * wins when it is mounted and configured; the process environment is the
 * fallback either way, keeping the tokenless-CLI path alive.
 * @param ctx - context possibly carrying the optional credentials seam.
 * @param ref - environment-variable name to resolve.
 * @returns the token, or undefined while unconfigured anywhere.
 */
async function resolveToken(ctx: Context, ref: string): Promise<string | undefined> {
  const credentials = ctx.get('credentials')
  if (credentials !== undefined) {
    const resolved = await credentials.resolve(brandRef(ref))
    if (resolved !== undefined) return resolved.value
  }
  return envToken(ref)
}

/** Brand a configured ref, mapping an unusable name to the seam's validation error. */
function brandRef(ref: string): ReturnType<typeof credentialRef> {
  try {
    return credentialRef(ref)
  } catch (cause) {
    throw new GitHubError(`credential ref "${ref}" is not a usable environment-variable name`, 'GITHUB_VALIDATION', { cause })
  }
}

/** Read a non-blank token from the process environment, or undefined. */
function envToken(ref: string): string | undefined {
  const value = process.env[ref]
  const trimmed = value === undefined ? '' : value.trim()
  return trimmed === '' ? undefined : trimmed
}
