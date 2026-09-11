/**
 * 安全策略：把 SKILL.md 的红线固化成代码闸门——脚本执行默认关闭、
 * 敏感站点禁止脚本读取、可选的域名白名单限制导航范围。
 */

/** 内置敏感站点关键词（银行、SSO、密码管理器等凭据面）。 */
export const DEFAULT_SENSITIVE_PATTERNS: readonly string[] = [
  'bank',
  'pay',
  'alipay',
  'paypal',
  'sso',
  'passport',
  'login',
  'signin',
  'auth',
  'account',
  '1password',
  'lastpass',
  'bitwarden',
  'keepass',
]

/** 策略配置。 */
export interface PolicyOptions {
  /** 是否允许在普通页面执行 evaluate。 */
  allowEvaluate: boolean
  /** 额外/覆盖的敏感站点关键词。 */
  sensitivePatterns: readonly string[]
  /** 非空时，导航只允许命中这些关键词的站点。 */
  allowedPatterns: readonly string[]
}

/**
 * 取 URL 的主机名（小写）；非法 URL 返回 null。
 * @param url - 目标 URL
 * @returns 主机名或 null
 */
export function hostOf(url: string | null | undefined): string | null {
  if (url === null || url === undefined || url === '') return null
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

/** 浏览器自动化安全策略。 */
export class BrowserPolicy {
  /**
   * @param options - 脚本开关、敏感模式与白名单
   */
  constructor(private readonly options: PolicyOptions) {}

  /**
   * 目标是否属于凭据面（禁止脚本读取）。
   * @param url - 目标 URL
   * @returns 命中敏感模式时为 true
   */
  isSensitive(url: string | null): boolean {
    const host = hostOf(url)
    if (host === null) return false
    return this.options.sensitivePatterns.some(pattern => host.includes(pattern))
  }

  /**
   * 校验导航目标是否在允许范围内。
   * @param url - 目标 URL
   */
  assertNavigable(url: string): void {
    if (this.options.allowedPatterns.length === 0) return
    const host = hostOf(url)
    if (host !== null && this.options.allowedPatterns.some(pattern => host.includes(pattern))) return
    throw new Error(`目标站点不在允许列表内：${url}（配置项 allowedPatterns 可调整）`)
  }

  /**
   * 校验是否可以执行脚本。
   * @param url - 当前页面 URL
   */
  assertEvaluateAllowed(url: string | null): void {
    if (!this.options.allowEvaluate) {
      throw new Error('evaluate 默认关闭：如确需脚本，请在插件配置中开启 allowEvaluate')
    }
    if (this.isSensitive(url)) {
      throw new Error(`拒绝在凭据面执行脚本：${url ?? '未知页面'}`)
    }
  }
}
