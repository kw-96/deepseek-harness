/** Lifecycle phase of a Cordis Loader entry. */
export type PluginPhase = 'pending' | 'loading' | 'active' | 'failed' | 'unloading' | null

/** Automatic source classification shown by the Web UI. */
export type PluginCategory = 'official' | 'third-party'

/** One managed non-group Loader entry. */
export interface ManagedPluginEntry {
  /** Stable runtime entry id, including nested group prefixes. */
  readonly entryId: string
  /** Local config row id written by profile patches. */
  readonly configId: string
  /** Exact module specifier imported by Cordis. */
  readonly moduleName: string
  /** Package-like root used for grouping in the Web UI. */
  readonly packageName: string
  /** Category derived from the checked-in official package registry. */
  readonly category: PluginCategory
  /** Functional group id: the harness packages/<group>/ directory for official entries, a declared `dsh.pluginManager.group` for third-party entries, or the category itself. */
  readonly group: string
  /** Human-readable package description, or null when none is available. */
  readonly description: string | null
  /** Effective enablement, including disabled ancestors. */
  readonly enabled: boolean
  /** Current root Fiber phase, or null when no live Fiber exists. */
  readonly phase: PluginPhase
  /** Whether this entry may be changed through this manager. */
  readonly protected: boolean
  /** Human-readable reason for a protected entry. */
  readonly protectionReason: string | null
  /** Current lifecycle failure text when Cordis exposes one. */
  readonly error: string | null
}

/** Point-in-time authoritative plugin manager state. */
export interface PluginManagerSnapshot {
  /** Absolute profile name inferred from the running config root. */
  readonly profileName: string
  /** The two automatic categories, including empty groups. */
  readonly categories: readonly PluginCategory[]
  /** Current non-group entries in Loader order. */
  readonly entries: readonly ManagedPluginEntry[]
}

/** Outcome for one requested plugin entry. */
export interface MutationItem {
  /** Requested runtime entry id. */
  readonly entryId: string
  /** Mutation outcome. */
  readonly status: 'changed' | 'restart-required' | 'unchanged' | 'skipped' | 'failed'
  /** Failure or skip explanation, otherwise null. */
  readonly message: string | null
}

/** Completed single-entry or package-level mutation. */
export interface MutationReceipt {
  /** Requested target enablement. */
  readonly enabled: boolean
  /** Per-entry outcomes in Loader order. */
  readonly items: readonly MutationItem[]
  /** Fresh authoritative snapshot after the operation settles. */
  readonly snapshot: PluginManagerSnapshot
}

/** MCP 传输类型：本地进程或可流式 HTTP。 */
export type McpTransport = 'stdio' | 'streamable-http'

/** 一条由插件管家维护的 MCP 服务行（投射自 profile patch）。 */
export interface McpServerRecord {
  /** Patch 行 id：`mcp-<serverName>`。 */
  readonly id: string
  /** MCP 命名空间名，同时是工具名前缀。 */
  readonly serverName: string
  readonly transport: McpTransport
  /** stdio 传输的启动命令；HTTP 传输为 null。 */
  readonly command: string | null
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
  readonly cwd: string | null
  /** streamable-http 传输的端点；stdio 传输为 null。 */
  readonly url: string | null
  readonly headers: Readonly<Record<string, string>>
  /** 单次工具调用超时（毫秒），未配置时为 null。 */
  readonly toolCallTimeoutMs: number | null
  readonly disabled: boolean
  /** 是否由插件管家维护（自带标记行可编辑；用户手写行只读展示）。 */
  readonly managed: boolean
}

/** MCP 服务的即时快照。 */
export interface McpServersSnapshot {
  readonly profileName: string
  readonly servers: readonly McpServerRecord[]
}

/** 新增或更新一条 MCP 服务时提交的传输无关输入。 */
export interface McpServerInput {
  readonly serverName: string
  readonly transport: McpTransport
  readonly command: string | null
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
  readonly cwd: string | null
  readonly url: string | null
  readonly headers: Readonly<Record<string, string>>
  readonly toolCallTimeoutMs: number | null
}

/** MCP 服务写操作的回执。 */
export interface McpMutationReceipt {
  /** 操作结果。 */
  readonly status: 'changed' | 'removed' | 'restart-required' | 'failed'
  /** 失败说明或重启提示，成功且立即生效时为 null。 */
  readonly message: string | null
  /** 操作后最新快照。 */
  readonly snapshot: McpServersSnapshot
}

/** 用户技能根中的一个技能条目。 */
export interface SkillRecord {
  /** 前言声明的技能名，缺失时回退为目录名。 */
  readonly name: string
  /** 技能目录名（稳定定位键）。 */
  readonly directory: string
  readonly description: string | null
  /** 是否允许模型调用（!disable-model-invocation）。 */
  readonly modelInvocable: boolean
  /** SKILL.md 的绝对路径。 */
  readonly source: string
}

/** 技能即时快照。 */
export interface SkillsSnapshot {
  /** 被扫描的用户技能根目录。 */
  readonly skillsRoot: string
  readonly skills: readonly SkillRecord[]
}

/** 技能写操作回执。 */
export interface SkillMutationReceipt {
  readonly status: 'changed' | 'failed'
  readonly message: string | null
  readonly snapshot: SkillsSnapshot
}
