# dsh-browser-agent

[English](README.md)

把 browser-skill（`SKILL.md` 提示词 + `bsk` CLI + 浏览器扩展）做成 DeepSeek Harness 的自研 Cordis 插件：
用**模型工具**驱动用户真实的 Chromium 浏览器，并把会话生命周期、引用新鲜度与安全闸门从"提示词自觉"
变成**代码保证**。

## 它解决了什么

| browser-skill 原始形态 | 本插件 |
| --- | --- |
| 模型读 SKILL.md，然后手敲 `bsk` 命令 | 12 个模型工具，参数即 schema，无需拼命令行 |
| 「必须 `session stop`」只是文字约束 | 四条回收路径全部由插件执行（显式/会话结束/卸载/空闲） |
| 「导航后引用失效」靠模型记得重快照 | 导航与点击自动置脏，写操作前自动补拍，写后自动重快照 |
| 观测升级顺序靠提示词 | 默认只返回 aria 快照，`html`/`screenshot` 必须显式索取 |
| 借用用户标签页、脚本执行无闸门 | `evaluate` 默认关闭，凭据面永久拒绝；借用标签页需审批；默认只看 Agent Window |
| 多浏览器实例时 `session start` 报错 | 单实例直接启动；多实例列出候选并要求配置 `browserInstance`；零实例给出可执行提示 |
| 会话被外部结束后所有调用持续失败 | 识别 `session not registered`，丢弃失效记录并提示重开页面，下次调用自动重建 |
| Windows 上 `bsk` 直连会因管道继承假死 | 驱动先 `bsk daemon start`（自动 detach），并用 argv 直连、不经 shell |

## 工具清单

| 工具 | 作用 |
| --- | --- |
| `browser_open` | 打开 URL（可新标签页）并返回带 `@eN` 的 aria 快照 |
| `browser_observe` | 观测当前页：`snapshot`（默认）/ `html` / `screenshot` |
| `browser_click` | 点击（`@eN` 或 CSS 选择器）；写前补拍、写后重拍 |
| `browser_fill` | 填写输入框（引用保持有效，不回快照） |
| `browser_press` | 按键/组合键；可能提交的键会刷新快照 |
| `browser_select` | 设置 `<select>` 的值（多选可重复） |
| `browser_history` | 后退 / 前进 / 刷新（可硬刷新） |
| `browser_tabs` | 标签页列表与建/关/选/借用/归还（默认只看 Agent Window，借用前需审批） |
| `browser_ask_human` | 请求人工介入（验证码、登录、二次确认），可高亮目标元素 |
| `browser_evaluate` | 执行脚本，默认关闭且在凭据面永久拒绝 |
| `browser_status` | daemon、已连接浏览器、本会话 Agent Window 状态 |
| `browser_stop` | 结束本次浏览器会话（关闭 Agent Window、归还借用的标签页） |

## 会话生命周期

每个 DSH 会话对应一个 `bsk` 会话，首次工具调用时懒启动；回收有四条路径：

1. 模型主动调用 `browser_stop`；
2. DSH 会话销毁（`agent/disposed` 事件）；
3. 插件卸载（`ctx.effect` 的释放器）；
4. 空闲巡检（默认 10 分钟无操作，由 `idleTimeoutMs` 配置）。

会话失效（被外部结束、daemon 重启）时不会静默重试：插件丢弃失效记录、把原因告诉模型，下一次调用重建会话。
`browser_status` 会区分「本插件持有的会话」与「其它工具遗留的会话」，便于人工排查。

## 配置

由插件的 `Config` schema 声明，`cordis.yml` 可覆盖：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `binary` | `bsk` | 可执行文件名或绝对路径 |
| `browserInstance` | `''` | 目标浏览器实例 id 或 label；空串表示要求唯一实例 |
| `workspaceRoot` | `process.cwd()` | `bsk` 子进程工作目录 |
| `idleTimeoutMs` | `600000` | 空闲多久后自动结束会话（毫秒） |
| `actionTimeoutMs` | `30000` | 普通命令超时 |
| `navigationTimeoutMs` | `60000` | 导航类命令超时 |
| `snapshotMaxChars` | `24000` | 单次快照交给模型的字符上限 |
| `screenshotDir` | `''` | 截图目录，空串用 `bsk` 的临时目录 |
| `allowEvaluate` | `false` | 是否允许 `browser_evaluate` |
| `requireApprovalForBorrow` | `true` | 借用用户标签页前是否必须取得宿主审批 |
| `sensitivePatterns` | 凭据关键词 | 命中即禁止脚本（login/sso/bank/密码管理器等） |
| `allowedPatterns` | `[]` | 非空时限制导航域名 |

## 实现落点

```
src/index.ts          Host 服务 BrowserAgent：注册工具、托管会话、暴露 Remote
src/remote.ts         browserAgent Remote 贡献（panel / stop / preview）
src/types.ts          面板与 Remote 的共享值类型（zod 校验线上数据）
src/host/bsk.ts       bsk CLI 驱动：argv 直连、退出码→中文建议、daemon detach
src/host/store.ts     会话托管：懒启动、引用置脏、空闲回收、stop/stopAll
src/host/policy.ts    安全策略：脚本开关、凭据面、域名白名单
src/host/snapshot.ts  快照处理：截断、标题提取、引用计数
src/host/parse.ts     bsk JSON 投影（未知字段一律忽略）
src/host/config.ts    配置 schema 与默认值
src/tools/*.ts        工具分组注册：观测 / 交互 / 导航与标签 / 控制
src/client/*          右栏「浏览器」标签：状态、标签页、截图预览、结束会话
```

关键设计取舍：

- **argv 直连而非 shell**：`bsk` 参数里会出现中文提示词、CSS 选择器与 `@eN`，任何 shell 引号规则都可能
  改变语义，因此统一走 `ctx.subprocess` 的 argv spawn。
- **daemon 先 detach**：`bsk` CLI 首次调用会 fork daemon 并让它继承 stdout 管道，采集方按管道 EOF 判定
  结束就会假死；插件在起会话前先 `bsk daemon start`，之后每次调用都干净退出。
- **执行面窄接口**：会话托管与工具只依赖 `BskCommandRunner`（`run`/`ensureDaemon`），测试可注入脚本化替身，
  不必启动浏览器。
- **不提权**：插件不注册任何"自动点击"后台行为，所有页面写操作都由一次显式工具调用触发；借用用户标签页
  必须经宿主审批服务放行（`requireApprovalForBorrow`，默认开启）。
- **注册即 effect**：12 个工具都通过 `ctx.effect(() => ctx.tools.register(...))` 注册，插件卸载或 Cordis HMR
  热替换时一定摘干净——否则重挂载会撞上「工具已注册」。组合测试显式断言了这条（挂载 12 → 卸载 0）。

## 验证

```sh
pnpm --filter dsh-browser-agent test            # 50 个用例（2 个真实浏览器用例默认跳过）
BSK_E2E=1 pnpm --filter dsh-browser-agent test  # 52 个全绿
```

测试分层：

| 文件 | 覆盖 |
| --- | --- |
| `tests/host.spec.ts` | bsk 输出解析、快照处理、安全策略、会话托管、多实例选择 |
| `tests/tools.spec.ts` | 工具注册与卸载、快照优先策略、引用补拍、截图回退 |
| `tests/tools-control.spec.ts` | 状态/人工求助/脚本闸门/借用审批/会话恢复 |
| `tests/client-panel.spec.tsx` | 右栏面板渲染与交互（jsdom） |
| `tests/bsk-e2e.spec.ts` | 真实浏览器：驱动级冒烟（BSK_E2E=1） |
| `tests/composition.spec.ts` | 真实 Cordis 组合挂载/卸载；组合内工具级真实浏览器流程（BSK_E2E=1） |

真实流程：起会话 → 导航 example.com → 快照 → 读 `document.title` → 结束会话 → 确认已回收；
组合内用例走的是与应用挂载后模型调用**同一段代码**（差别只在没有 Loader/ToolRuntime 外壳）。

## 已知限制

- **整页截图在本机 Edge 上会被 CDP 拒绝**（`cdp_failed: image readback failed`，元素级截图正常）。插件
  自动回退为「最新快照根节点」截图，得到视口等效 PNG，并在结果 `note` 中说明回退原因。
- 面板按需拉取（挂载与刷新按钮），不做实时推送。
- **开发循环注意**：不要与 `dev.mjs` 的 watch 同时跑 `pnpm run build`（它先 `clean` 掉 `lib/`，与 watch 的
  增量构建竞态，会出现 `UNRESOLVED_ENTRY` / `MISSING_EXPORT`，客户端 bundle 可能一度缺失）。需要完整构建时
  先停 dev.mjs，构建完再重启它。
- 首次把插件纳入组合需要重启一次 `dsh web`：向运行中的实例新增 bundle/patch 条目不会被热应用。
- browser-skill 的 `SKILL.md` 仍适合在 DSH 之外（Cursor/Codex 等）直接使用；在 DSH 内，本插件的工具描述
  已经是权威说明，无需再手敲 CLI。

## 重启自检清单

新插件首次纳入组合必须重启一次 `dsh web`（bundle 与 patch 行不会热应用）。重启前可先确认三处接线：

```powershell
$profile = "$env:USERPROFILE\.dsh\profiles\web"
# 1) junction 指向插件源码
(Get-Item "$profile\node_modules\dsh-browser-agent").Target
# 2) bundle 列表已收录
Select-String -Path "$profile\package.json" -Pattern 'dsh-browser-agent'
# 3) patch 行已启用
Select-String -Path "$profile\cordis.patch.yml" -Pattern 'browser-agent'
```

重启后按顺序自检：

1. `bsk doctor` 全绿（daemon、扩展连接、协议兼容）；
2. 右栏出现「浏览器」标签，点开显示会话状态与标签页；
3. 让模型执行一次「打开 example.com 并读标题」——应看到 `browser_open` 调用，而非手敲 `bsk`；
4. 结束后 `browser_status` 应显示 `ownedSessions: 0`，Agent Window 自动关闭。
