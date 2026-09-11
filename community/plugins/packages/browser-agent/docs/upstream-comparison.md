# 上游官方插件 vs 自研 dsh-browser-agent：对比与取舍

对比对象：上游 `Tencent/BrowserSkill` 的 `packages/dsh-plugin-browserskill`
（npm 包 `@wxg-prc-cpg/browser-skill-dsh-plugin` v0.2.1）与本仓库自研的
`community/plugins/packages/browser-agent`（包名 `dsh-browser-agent`）。

证据来源：上游源码本地克隆 `E:\KW\Git\BrowserSkill`（main，7dc8b01）与其 README、package.json；
自研插件的源码、52 项测试与本机 web profile 实机验证。

## 结论

**保留自研插件为主线，从上游移植三项能力；不切换到官方插件。**

理由（均为实测）：

1. 官方插件的宿主 peer 范围是 `^0.1.0-rc.6`，本 fork 已升到 0.1.5-rc.1；预发布语义下
   `^0.1.0-rc.6` 不覆盖 0.1.5-rc.1，直接安装会出现 peer 不匹配，且其代码面向的是更早的 API 线。
2. 官方插件的实时观测视图依赖 `dsh-better-sidebar`（本 fork 无此包）；无它时退化为浮动面板，
   而本 fork 的 ui-layout 是定制过的面板架构，集成效果未经验证。
3. 自研插件是按本 fork 实际 API（0.1.5-rc.1）与右栏架构写的，且已在本机 web profile 中
   实机跑通（12 个工具 + 右栏「浏览器」标签 + 会话自动回收）。
4. 官方插件多出的是**能力广度**，不是不可替代的架构；其中三项可以直接移植过来。

## 工具面对比

| 自研（12 个专用工具） | 官方（6 个动作型工具） |
| --- | --- |
| `browser_open`、`browser_observe` | `browser_page`（navigate/back/forward/reload/wait）、`browser_inspect`（observe/snapshot/html/screenshot/console/network） |
| `browser_click`、`browser_fill`、`browser_press`、`browser_select` | `browser_interact`（click/hover/wheel/scroll-to/focus/blur/fill/select/press） |
| `browser_history` | 并入 `browser_page` |
| `browser_tabs` | `browser_tabs`（**同名**：两者不能同时启用） |
| `browser_ask_human`、`browser_evaluate` | `browser_assist`（resize/emulate/request-help）；**不提供页面脚本求值** |
| `browser_status`、`browser_stop` | `browser_session`（start/stop/list，支持多会话，上限默认 5） |

## 官方领先的地方

- **交互与诊断面更宽**：hover、wheel（带符号增量）、scroll-to、focus/blur、console、network、emulate、resize、wait。
- **实时观测视图**：会话按 1.5s（活跃）/ 8s（空闲）周期截图，面板显示当前动作、耗时与最近截图，
  支持 Interrupt 中断、拖动/缩放、画中画弹出；观测端点限回环地址。
- **截图进模型**：`image.ts` 走 DSH 附件服务，模型能真正“看到”截图；我们目前只返回文件路径，
  需要模型再调用读图工具。
- **多会话模型**：一次对话可并行驱动多个浏览器会话，每次调用可带 `session` 参数并在结果里回显。
- **懒加载工具 + 自带 skill**：默认只有 skill 目录项可见，调用 skill 后才把 6 个工具注入系统提示，
   省 token；且安装插件即带 skill，无需 `bsk install-skill`。
- **npm 分发**：`dsh plugin --profile web add ...` 一条命令安装，不需要 junction。

## 自研领先的地方

- **审批闸门**：借用用户标签页前调用宿主 `ctx.approval`，未获批拒绝执行（官方未见等价闸门）。
- **凭据面保护**：`evaluate` 默认关闭，且在任何情况下拒绝在 login/SSO/银行/密码管理器域名上执行；
  多浏览器实例选择（`browserInstance`，单/多/零实例三种可执行提示）。
- **会话回收更全**：显式 stop、DSH 会话销毁、插件卸载、空闲巡检四条路径；
  官方主要是显式 stop 与插件卸载。
- **本 fork 适配**：中文文案、右栏框架、与 codex-shell/git-timeline 一致的开发链路（dev.mjs + HMR）。

## 移植进度（2026-09-11 更新）

| 项 | 状态 | 落地方式 |
| --- | --- | --- |
| A 点击方式可选 | ✅ | 新增配置 `clickMode: 'pointer' \| 'dom'`；`dom` 用 `hover` 取坐标 + 固定表达式 `element.click()` 跳过扩展浮层 |
| B P0 截图进模型 | ✅ | 截图经 `ctx.get('attachments').saveImage()` 存为附件，工具结果追加 `image` 内容块；宿主无附件库或路由不支持图像时自动退回路径形态。实测模型可直接看到页面 |
| C P2 交互/诊断面 | ✅ | 新增 5 个工具：`browser_hover`、`browser_wait`、`browser_inspect`（console/network）、`browser_emulate`、`browser_transfer`（upload/download）；均已真实浏览器验证 |
| D P1 实时观测视图 | ✅ | 面板实时区：每秒轮询当前动作与耗时、2.5 秒刷新截图、可中断正在执行的工具调用（中断经合并信号终止 CLI 子进程，daemon 协同取消） |
| E P3 多会话 | ⏳ 待做 | `browser_session` 式多会话与 `session` 参数 |

## 移植建议（按价值排序）

- **P0 截图进模型**：接 `@deepseek-ai/dsh-attachment`，把 `browser_screenshot` 的 PNG 变成附件/图像块，
  模型可直接看图，不必再走 OCR/读图工具。
- **P1 实时观测视图**：周期性截图 + 当前动作/耗时 + 中断按钮；可先用轮询实现，后续再引入回环 HTTP。
- **P2 交互面补齐**：hover、wheel、scroll-to、focus/blur、console/network、wait、emulate/resize。
- **P3 多会话**：`browser_session` 式的多会话与 `session` 参数（当前是「一个 DSH 会话一个 bsk 会话」）。

## 本机现状（2026-09-11 实测）

- CLI：`0.2.1`（daemon 协议 `1.1`），安装在 `~/.local/bin/bsk.exe`，旧版备份为 `bsk-0.1.6.exe.bak`。
- 扩展：仍为 `0.1.2`（协议 `1.0`）→ `bsk doctor` 报「版本不一致，可用但建议尽快升级」；升级须由人在
  浏览器侧完成（商店 `emacgiaaaiojkkpkddmmdfhmokgmnikg`，或加载已解压到
  `~/.local/share/bsk-extension/0.2.1` 的离线包）。
- 上游约定：自 0.2.0 起 CLI / 扩展 / DSH 插件共用同一版本号，三者应一起升到 0.2.1。
- 上游源码：`E:\KW\Git\BrowserSkill`（main，浅克隆）；依赖已装，扩展可构建（`dist/chrome-mv3`，
  版本 0.2.1）且单测通过（1259 passed / 40 skipped）。

## CLI 0.2.1 新增的命令面（决定移植成本）

从 0.1.6 升到 0.2.1 后 `bsk` 多出一批命令，P0–P3 的移植成本因此明显下降：多数能力已有现成 CLI 支撑，
插件侧只需包一层工具与结果投影。

| 新命令 | 对应移植项 | 说明 |
| --- | --- | --- |
| `observe` | P1/P2 | 语义化 VOM 观测（含 perception probes），比纯 aria 快照更结构化 |
| `console`、`network` | P2 | 读取缓冲的 console/异常信息与网络响应/失败 |
| `hover` | P2 | 悬停交互 |
| `upload`、`download` | P2 | 经页面 file input 上传；捕获一次下载并落盘 |
| `emulate` | P2 | 在标签页上模拟移动端（viewport/UA/touch） |
| `window` | P1 | Agent Window 级管理 |
| `record` | 新增能力 | 把用户操作录成语义化 `trace.json` 教材，供模型复用 |
| `update` | 第 3 步 | CLI 自更新；新机装配脚本可优先调用它，而不是重新下载安装 |

## 不可同时启用

两者都注册 `browser_tabs`，且都会驱动同一个 bsk daemon。若将来要试官方插件，必须先停用自研插件
（profile 的 `cordis.patch.yml` 里把 `id: browser-agent` 置为 `disabled: true`）。
