# dsh-browser-agent

[English](README.md) | 中文

面向 DeepSeek Harness 的浏览器自动化：模型工具，外加一个 Web 面板，通过 browser-skill 的 [`bsk`](https://github.com/) CLI 驱动用户**真实的 Chromium 浏览器**。

插件把 browser-skill 的工作流（只有一个提示词形式的 skill，外加一个要手工调用的 CLI）变成插件自己拥有的代码：工具面固定、引用自动刷新，自动化会话由插件回收，而不是靠模型自己记住。

## 它做什么

- 注册 18 个模型工具：`browser_open`、`browser_observe`、`browser_click`、`browser_hover`、`browser_fill`、`browser_press`、`browser_select`、`browser_history`、`browser_tabs`、`browser_session`、`browser_transfer`、`browser_wait`、`browser_inspect`、`browser_emulate`、`browser_ask_human`、`browser_evaluate`、`browser_status`、`browser_stop`。
- 为每个 DSH 会话托管 `bsk` 会话：首次使用时懒启动，并经由五条路径回收：显式调用 `browser_stop`、DSH 会话销毁（`agent/disposed`）、插件卸载、对已不存在的宿主会话回收遗留记录（插件重启后会话 id 已变，旧记录再无人能替它 `browser_stop`），以及空闲巡检。周期巡检中的失败只记日志、不抛出：一次 `bsk` 命令失败不能终止承载全部会话的 `dsh web` 后端。
- 选择目标浏览器：只连一个实例时直接启动；有多个实例时拒绝启动并列出候选，便于部署方通过 `browserInstance` 固定其中一个；一个都没有时明确说明该修什么。
- 从被外部结束的会话中恢复：遇到 `session not registered` 失败时丢弃陈旧记录并提示模型重新打开页面，下一次调用再懒启动一个新会话。
- 让引用保持可信：任何导航或点击都把引用标记为陈旧，消费引用的工具在写入前重新快照，在 DOM 可能变化后再快照一次。
- 支持同一会话下并行多个浏览器会话：`browser_session` 负责列出/新建/切换/关闭（别名区分），其余工具用可选的 `session` 参数指向其中之一，不传即当前活跃会话；宿主会话结束或空闲回收会一起收掉全部别名。
- 默认观测优先：除非调用方要求 `html` 或 `screenshot`，`browser_observe` 返回无障碍快照。截图会提交到宿主附件库并作为图像内容块内联给模型（宿主未挂附件库、或当前模型路由不接受图像输入时，退回只给文件路径）。
- 提供右栏标签页「浏览器」：会话状态、标签页、最近截图，以及**实时观测区**——每秒刷新当前动作与耗时、按需中断正在执行的工具调用，并有「结束会话」按钮。

## 环境要求

1. `PATH` 中有 `bsk`（browser-skill CLI；已在 0.2.1 上按 daemon 协议 1.1 验证）。
2. 一个 Chromium 系浏览器，已加载并连接 browser-skill 扩展（`bsk doctor` 应为全绿）。
3. DeepSeek Harness 0.1.5-rc.1 或更高版本。

## 新机器装配

完整、可交给 agent 执行的装配流程（含验收判据与已知陷阱）见 [`docs/new-machine-setup.md`](docs/new-machine-setup.md)。`scripts/setup-browser-skill.ps1` 负责安装并验收运行环境（Windows；Windows PowerShell 5.1 下可用）：

| 命令 | 作用 |
| --- | --- |
| `.\setup-browser-skill.ps1` | 只自检：CLI 版本、daemon、扩展连接、协议错配，并给出修复建议（不改变任何东西） |
| `... -Mode install` | 升级 CLI（存在官方 `bsk update --yes` 时用它，否则用上游 installer，含 sha256 校验与 PATH 配置），然后执行 `bsk install-skill --yes` |
| `... -Mode extension -ExtensionMode store` | 打开商店页面（推荐；后续会自动更新） |
| `... -Mode extension -ExtensionMode unpacked -ExtensionVersion 0.2.1` | 离线：把扩展 zip 下载到 `~/.local/share/bsk-extension/<version>` |
| `-WriteEdgePolicy` / `-RemoveEdgePolicy` | 为商店版扩展添加或移除当前用户的 Edge 强制安装策略 |

退出码 `0` 表示可用（可能带有升级提示）；`1` 表示存在需要处理的 `fail` 行。按上游设计，安装扩展本身必须由人完成；脚本只负责准备与验收。

## 安装

```sh
# from the community plugins workspace
pnpm --filter dsh-browser-agent build

# link it into a profile (dev loop: junction + Cordis HMR)
node community/plugins/dev.mjs
```

然后确认 profile 的 `cordis.patch.yml` 里带有该行（dev.mjs 负责添加组合包条目，被 loader 组合的是这一行）：

```yaml
- { id: browser-agent, name: dsh-browser-agent, disabled: false }
```

**首次组合该插件时必须重启一次 `dsh web`。** 向已在运行的实例添加组合包或 patch 条目不会被实时拾取（开发配置里的 HMR watch 范围不覆盖 profile patch 文件），因此挂载后重启一次。

## 配置

由插件的 `Config` schema 声明，可在 `cordis.yml` 中覆盖：

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `binary` | `bsk` | 可执行文件名或绝对路径。 |
| `browserInstance` | `''` | 目标浏览器实例的 id 或 label；为空时要求只有一个已连接浏览器。 |
| `workspaceRoot` | `process.cwd()` | `bsk` 子进程的工作目录。 |
| `bskHome` | '' | bsk 的 home（daemon socket/锁/日志所在）。空串用 bsk 默认 `~/.bsk`；**测试必须指向临时目录**，否则测试结束回收子进程 Job 会连带杀掉真实 daemon。 |
| `idleTimeoutMs` | `600000` | 巡检结束会话前的空闲时长。 |
| `actionTimeoutMs` | `30000` | 普通命令的超时时间。 |
| `navigationTimeoutMs` | `60000` | 导航类命令的超时时间。 |
| `snapshotMaxChars` | `24000` | 单次交给模型的快照字符上限。 |
| `screenshotDir` | `''` | 截图输出目录；为空时使用 `bsk` 的临时默认目录。 |
| `allowEvaluate` | `false` | `browser_evaluate` 是否允许执行。 |
| `clickMode` | `pointer` | 点击方式：`pointer` 走 CDP 指针事件；`dom` 先 `hover` 取坐标、再经固定表达式执行 `element.click()`，用于扩展浮层吞掉指针点击的过渡场景。表达式由插件生成，模型无法注入脚本。 |
| `requireApprovalForBorrow` | `true` | 借用用户标签页前是否先询问 harness 审批服务。 |
| `sensitivePatterns` | 凭据关键词 | 命中即拒绝脚本的主机名子串。 |
| `allowedPatterns` | `[]` | 非空时把导航限制在匹配的主机。 |

## 安全默认值

- 除非部署方开启，`evaluate` 一律**关闭**，并且在凭据主机（登录/SSO/银行/密码管理器）上永远拒绝。
- `browser_tabs` 默认列出 Agent Window（`scope: agent`）；只有调用显式要求 `scope: user` 时，用户自己的标签页才可见。
- 写操作只作用于 Agent Window 中的标签页；用户标签页必须先借用，而借用会先询问 harness 审批服务（`requireApprovalForBorrow`），并在会话结束时自动归还。

## 验证

```sh
pnpm --filter dsh-browser-agent test            # 50 cases; the two real-browser cases skip by default
BSK_E2E=1 pnpm --filter dsh-browser-agent test  # all 52 cases against the real browser
```

`tests/composition.spec.ts` 在真实的 Cordis 上下文中挂载插件，并通过真实浏览器驱动工具定义本身，这与插件挂载进 profile 后模型使用的代码路径相同；`tests/client-panel.spec.tsx` 在 jsdom 下覆盖右栏面板。

## 已知限制

- **整页截图**：使用 0.1.x 扩展时，它在某些 Windows/Edge 版本上会失败（`cdp_failed: image readback failed`）；插件重试一次，然后回退到快照根节点引用（只有旧版 aria 快照格式才有这种能力），并通过 `note` 上报。0.2.1 起整页截图可用，因此回退只是最后手段。
- **0.2.1 观测格式**：`snapshot`/`observe` 现在返回 VOM 文本（`@vom/@view/@layers`，引用只标在交互元素上），而 0.1.x 返回的是每个节点都带引用的 aria 树；插件对两种格式都做了处理。
- 面板按需拉取（挂载时与点「刷新」时），不做流式推送。
- **开发循环：** 不要在 `dev.mjs` 处于 watch 状态时运行 `pnpm run build`：它的 `clean` 步骤会清空 `lib/`，与 watch 的增量构建竞态（`UNRESOLVED_ENTRY` / `MISSING_EXPORT`，客户端 bundle 还可能一度缺失）。先停掉 `dev.mjs`，构建完再重新启动。
- 每个 DSH 会话对应一个 `bsk` 会话；并行的 DSH 会话各自拥有自己的 Agent Window。
