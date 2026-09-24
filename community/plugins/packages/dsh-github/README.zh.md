# dsh-github

[English](README.md) | 中文

一个 npm 包承载完整的 GitHub 连接器：**`ctx.github` 能力 seam**、它的 REST v3 provider、面向模型的 `github_*` 工具套件、Device Flow 连接服务，以及 web UI（连接 GitHub 卡片 + 对话 PR 状态条）。它把 `dsh-github`、`dsh-github-rest`、`dsh-tool-github`、`dsh-github-connect`、`dsh-ui-github` 五个包合并为一次安装，但职责不合并：各自保留 `src/` 下的模块树，并各自作为一条宿主插件行挂载。

| 宿主行 | 模块 | 角色 |
|---|---|---|
| `github` | `dsh-github` | Service Definition：`ctx.github`、provider 注册表、选择策略、读写词汇、seam 层 diff 预算执行、`GitHubError` 错误分类 |
| `github-rest` | `dsh-github/rest` | Provider：`fetch` 直调 GitHub REST v3、凭据解析、分页、限流/错误映射、幂等 PR 创建、GHES `baseURL` |
| `tool-github` | `dsh-github/tools` | Consumer：面向模型的 `github_*` 工具 schema、校验、提示词指引、工具层预算与呈现 |
| `github-connect` | `dsh-github/connect` | `ctx.githubConnect`：Device Flow 授权、确定性 flow-state 检测、`@Remote` 按钮方法 |
| `ui-github` | `dsh-github/ui` | Web UI 的 node 半侧与 `./client` bundle：连接 GitHub 设置卡片与对话 PR 状态条 |

`cordis.patch.yml` 只插入这五行，行 id 沿用原包。行顺序不承载加载语义（激活由服务可用性驱动），任意顺序组合出同一套宿主。

## 服务 API（`ctx.github`）

| 成员 | 语义 |
|---|---|
| `registerProvider(provider)` | 注册一个后端。id 重复时抛 `GitHubError` `GITHUB_PROVIDER_DUPLICATE`。返回 disposer，随注册方 fiber 一起销毁。 |
| `search(request, signal?)` | 解析 provider 并执行一次搜索。seam 对结果执行 `request.maxResults`（截断 `items[]` 并置 `truncated`）。 |
| `getIssue` / `getPullRequest` / `getComments` / `getChecks` | 规范化的按需读取。PR 元数据不内嵌 diff 与 checks——它们是独立调用。 |
| `getDiff(item, request?, signal?)` | 读 PR diff，并在 seam 层执行 consumer 持有的 `maxFiles` / `maxPatchChars` 预算（ADR-0005）。`truncated` 永远诚实：无论 provider 侧还是 seam 侧发生过任何削减即为 true。 |
| `getReviews` / `getReviewComments` | 已提交的审查裁决，以及它们携带的行级评论。`GitHubReviewComment` 刻意不等同于 `GitHubComment`：它带文件路径与行号，处理方式是去改那段代码。 |
| `getCheckFailures(item, request?, signal?)` | 失败的检查为什么失败：CI 工具报了 annotation 就用它，否则取受 consumer 持有的 `maxLogLines` / `maxLogChars` 预算约束的日志**尾部**（ADR-0015）。诚实规则同 `getDiff`——单是 provider 侧截断过的日志，就足以让整个结果标记为 truncated。 |
| `buildReviewBrief(item, request?, signal?)` | 结构化审查的确定性那一半（ADR-0013）：路由出本次改动真正值得审的维度，diff **只带一次**，附上 checklist、严重度口径与 finding 契约。只做路由与证据打包，绝不做判断。 |
| `getMergeability` / `listPullRequests` | 合并就绪度（连同人话写明的阻塞原因）与受上限约束的 PR 列表。 |
| `submitReview` / `updatePullRequest` / `requestReviewers` / `setLabels` | 审查写的那一半。seam 校验行级评论的锚点，但**不**决定裁决是否被允许——那条策略管的是"模型可以做什么"，因此归工具层（ADR-0014）。 |
| `createIssue` / `createComment` / `createPullRequest` | 写操作。PR 创建幂等（ADR-0004）：同 head/base 已有开放 PR 时返回既有 PR，`created: false`。 |

读与写刻意由**单一 provider 接口**拥有（ADR-0003）：它们共享身份、凭据与限流配额，拆开会让鉴权状态产生分歧。

provider 注册的是**能力**而非工具。模型可见的名称、描述、提示词、JSON schema 与呈现，均由 `dsh-github/tools` 这一行独家拥有。

## 选择策略

选择不依赖注册、配置或 HMR 顺序。要么显式配置 provider id（配置项 `provider`，或喂给同一字段的环境变量 `$DSH_GITHUB_PROVIDER`），要么恰有一个可用 provider 时自动选中。操作在**每次调用时**执行期解析 provider——从不缓存——因此凭据变更翻转 `available()` 后无需重启即生效：

| 情形 | 执行 |
|---|---|
| 配置的 id 已注册且 `available()` | 运行该 provider |
| 配置的 id 未注册 | `GITHUB_PROVIDER_CONFIGURED_MISSING` |
| 配置的 id 已注册但不可用 | `GITHUB_PROVIDER_CONFIGURED_UNAVAILABLE` |
| 未配置 id，恰有一个可用 provider | 运行它 |
| 未配置 id，无可用 provider | `GITHUB_PROVIDER_UNAVAILABLE` |
| 未配置 id，多个可用 provider | `GITHUB_PROVIDER_AMBIGUOUS` |

provider 的 `available()` 是廉价的本地检查（凭据 ref 可否解析），**禁止发起网络调用**。

## 词汇

`GitHubRepoRef`（`owner`、`repo`）与 `GitHubItemRef`（`repo`、`number`、`url?`）是模型在工具间传递的可移植 handle。读形状：`GitHubIssue`、`GitHubPullRequest`（`merged` 是一等状态）、`GitHubComment`、`GitHubDiff`（`files[]`、`truncated`）、`GitHubChecksResult`。`GitHubSearchKind` 是闭合联合（`issues` | `pull-requests` | `repositories` | `code`）——消费端 `switch` 穷尽。写形状：`GitHubIssueCreateRequest`、`GitHubCommentCreateRequest`、`GitHubPullRequestCreateRequest` → `GitHubPullRequestCreateResult`（`pullRequest`、`created`）。seam 以 `GITHUB_VALIDATION` 校验 ref（owner/repo 非空、编号为正整数）与预算参数。完整契约与 `GitHubError` 错误码分类（`GITHUB_AUTH`、带 `retryAfterMs` 的 `GITHUB_RATE_LIMITED`、`GITHUB_NOT_FOUND`、`GITHUB_VALIDATION`、`GITHUB_ABORTED`、`GITHUB_PROVIDER_*`）见 `src/types.ts`。

## REST provider（`dsh-github/rest`）

`ctx.github` 的 **REST v3 provider**：直接使用平台 `fetch`（ADR-0006，不引 octokit），以 provider id **`rest`** 注册。它把端点全集映射到 seam 的规范化词汇表，并恪守 seam 契约要求的全部策略：每次操作重新解析凭据、诚实截断、不做内建重试。

### 配置

| 字段 | 默认值 | 语义 |
|---|---|---|
| `credentialRef` | `GITHUB_TOKEN` | token 所经由的环境变量**名**——只是引用、绝不是秘密本身，settings 文档因此不含任何 token 值。 |
| `baseURL` | `https://api.github.com` | API 根地址。GitHub Enterprise Server 指向 `https://ghes.example.com/api/v3`；容忍尾部斜杠。 |

该配置属于本插件的组合入口（composition entry）。Loader 会用上面的 schema 校验变更后的配置，随后重启本插件，因此 `apply` 每次拿到的都是当前生效的配置，provider 也在每次操作时重新读取它——新的 `credentialRef` 或 `baseURL` 会作用于下一次 GitHub 调用。DSH 0.1.7 已移除 `installSettingsSection` / `settingsNamespace`，其 settings 服务只投影插件声明为 `.volatile()` 的字段；这两个字段是普通配置，通过入口配置编辑，而不是设置表单。

### 凭据解析

每次操作都重新解析（轮换后的 token 无需重启即达下一次调用）：可选的凭据 seam（`ctx.get('credentials')`）挂载且已配置时优先；无论何种情况，进程环境变量都是回退路径——CLI 直接 `export GITHUB_TOKEN` 即可用，无需挂载任何 seam。`available()` 只做本地廉价检查（seam 已挂载，或环境变量非空白），绝不触网；凭据未配置在每次操作中以 `GITHUB_AUTH` 呈现。

### 传输策略

- **分页**：跟随 `Link` header，硬上限 10 页；评论、diff 文件、check runs 跨页聚合。diff 读取在 `maxFiles` 预算可满足时提前停止取页，并诚实上报 `truncated`（ADR-0005——seam 仍会执行预算）。
- **限流**：携带 `retry-after` 或主配额耗尽证据的 403/429 映射为 `GITHUB_RATE_LIMITED { retryAfterMs }`。provider **绝不自动重试**——该决策归调用方（seam 契约）。
- **错误映射**：401 → `GITHUB_AUTH`、404 与 410 → `GITHUB_NOT_FOUND`（410 是 Actions 日志过期时的返回——那是"不存在"，不是传输故障）、422 → `GITHUB_VALIDATION`（原样保留 API 消息）、中止 → `GITHUB_ABORTED`、传输失败 → `GITHUB_PROVIDER_NETWORK`、其余 → `GITHUB_PROVIDER_HTTP`。
- **CI 失败证据**（ADR-0015）：annotation 优先；只有当失败的 check run 没报 annotation（或调用方显式要求）时才去取 job 日志。日志端点会 302 到对象存储，我们**手动跟随且不带 `Authorization` 头**——签名 URL 自带授权，把用户 token 转发给存储域等于泄露凭据。`details_url` 指不出 Actions job 的 run 就没有日志。
- **审查写**：`POST /pulls/{n}/reviews` 提交审查（行级评论的 side 映射为线上的 `LEFT`/`RIGHT`）、`PATCH /pulls/{n}` 改字段、`POST /pulls/{n}/requested_reviewers` 指派、label 用 `POST`（追加）或 `PUT`（替换）。GitHub 对"批准自己 PR"那句干巴巴的 422 会被改写成说清缘由的人话。
- **幂等 PR 创建**（ADR-0004）：先按精确 head/base 查开放 PR（命中即返回 `created: false`）；未命中才 POST；竞态落败（422 "already exists"）时再查一次并返回胜者的 PR。

## 模型工具（`dsh-github/tools`）

基于 `ctx.github` 的**面向模型的 `github_*` 工具套件**。本行拥有 schema、校验、提示词指引、工具层预算与呈现——绝不涉足 provider、传输或凭据。

| 工具 | 作用 |
|---|---|
| `github_search` | 搜索 issues / pull-requests / repositories / code（闭合 kind 联合）。精简结果：`owner/repo#N [state] title` + URL。 |
| `github_issue_read` | 标题、状态、标签、正文，外加封顶的聚合评论。 |
| `github_pr_read` | 拆分为按需 part：`metadata`（默认）/ `diff` / `comments` / `reviews` / `checks` / `ci-failures`——一次调用绝不为模型没要的数据付费。 |
| `github_pr_review` | 为一个 PR 组装结构化审查任务：diff（只出现一次）、适用于本次改动的维度、每个维度的 checklist、严重度口径、finding 契约。给的是证据与契约，不是裁决（ADR-0013）。 |
| `github_pr_list` | 列出仓库的 PR，可按状态与 head/base 过滤。只读。 |
| `github_issue_create` | 写操作，审批门控。 |
| `github_issue_comment` | 写操作，审批门控。 |
| `github_pr_create` | 写操作，审批门控，幂等（同 head/base 已有开放 PR 是正常答案，不是错误）。 |
| `github_pr_review_submit` | 写操作，审批门控。提交带行级评论的审查。`APPROVE` / `REQUEST_CHANGES` 只在 `reviewVerdicts` 打开时存在（ADR-0014）。 |
| `github_pr_update` | 写操作，审批门控。标题、正文、base 分支、开/关状态。 |
| `github_pr_assign` | 写操作，审批门控。指派 reviewer、应用 label。 |

### 配置

| 字段 | 默认值 | 语义 |
|---|---|---|
| `write` | `true` | 注册写工具。关闭后它们完全不出现在工具目录里。 |
| `searchMaxResults` | `8` | 每次搜索的命中上限（search API 限流预算稀缺：30 次/分钟）。 |
| `maxComments` | `30` | 每次读取返回的评论上限。 |
| `diffMaxFiles` / `diffMaxPatchChars` | `50` / `60000` | **工具层持有**的 diff 预算（ADR-0005）：此处持有、传给 seam、由 seam 执行。 |
| `logMaxLines` / `logMaxChars` | `80` / `8000` | **工具层持有**的 CI 日志预算，机制同上。只作用于日志**尾部**（ADR-0015）。 |
| `reviewMaxFiles` / `reviewMaxPatchChars` | `60` / `120000` | **工具层持有**的审查 brief 预算。刻意不复用上面的 diff 预算：审查读的范围比普通 diff 读更宽（ADR-0013）。 |
| `reviewVerdicts` | `false` | `APPROVE` / `REQUEST_CHANGES` 是否存在。默认关（ADR-0014）——见下节。 |
| `timeoutMs` | `30000` | 挂到每个工具上的协作式超时（由 `dsh-timeout-policy` 执行）。 |

### 审查裁决默认关闭（ADR-0014）

提交审查是本套件第一个带**社会后果**的操作：`APPROVE` 与 `REQUEST_CHANGES` 以用户本人的账号发出，在协作者眼里就是用户的判断，并且会改变 PR 是否被阻塞。对这种操作，"每次弹审批"是错误的最后防线——在审批疲劳下，一次走神的"是"就够了。

所以能力本身是 opt-in 的。`reviewVerdicts` 关闭时（默认），event 枚举里只有 `COMMENT`：模型根本看不到"可以批准"这件事，也就无从尝试、无从被拒。打开开关才会加宽枚举，而每次提交仍然要过审批流，理由里会点明 event 及其后果。

两点值得知道：

- GitHub 不允许对**自己创建的** PR 执行 `APPROVE` 与 `REQUEST_CHANGES`。状态条 [AI 审查] 恰恰就是这种场景，因此它只可能产出 `COMMENT` —— provider 会把平台那句干巴巴的 422 翻译成人话。
- 宿主的 `PreToolDecision` 只带一个 reason 字符串，没有可提升的风险级别，所以那段 reason 的措辞**就是**这里能有的全部确认层。

### 审批流（写操作）

每个写操作在 `tools/pre-execute` 返回 `ask`，附带人类可读的理由——目标 repo、标题、正文摘要——正是宿主 ApprovalPanel 渲染的内容。注册表经可选审批 seam 解析该 ask：`allowed-once` 放行；拒绝、取消、审批通道缺失各自物化为不同的模型可见拒绝结果（绝不抛异常），模型可以解释并继续。读工具原样通过闸门。

### 呈现

`presentCall` / `presentResult` 是纯函数、回放安全：读呈现为 `read`/`search` 卡片，写呈现为 `edit` 卡片；`github_pr_create` 把 `created: false` 呈现为 "PR #N already open"。结果 meta 防御性收窄——畸形的回放 meta 回退到通用卡片而不是抛错。

### 模型可行动的错误

seam 失败在工具边界翻译：限流变为携带 `retryAfterMs` 的等待重试提示（并引导改用直接读取而非搜索），鉴权失败点名修复方式（连接 GitHub / 设置 `GITHUB_TOKEN`），not-found 指向 handle 本身。diff 截断附带"缩小范围"提示。

## 连接服务（`dsh-github/connect`）

**GitHub 连接服务**（`ctx.githubConnect`）：从"用户点击 Connect GitHub"到"输入框上方的状态条知道该给什么"之间的一切。三项职责：

1. **Device Flow 授权**（ADR-0001）：`startDeviceFlow()` 立即返回 user code，后台按服务端节奏轮询（`authorization_pending` 继续、`slow_down` 加 5 秒、`expired_token` / `access_denied` 终止）。成功后 token 落入**凭据 seam**（`credentials.set`）——正是其 `credentials/reference-updated` 事件让所有消费方即时刷新，无需重启，且 token 值从不经过前端。v1 使用不过期授权；refresh token 的空白在其将来落点处以代码注释记录。
2. **确定性 flow-state 检测**（ADR-0002）：每次 `agent/turn-stopping` 后，廉价 git 事实（当前分支、head sha、领先数）加一次分支 PR 查询，归纳为四态状态机——`hidden` / `pr-ready` / `pr-open`（带 CI 汇总）/ `pr-merged`——经 `github/flow-state` 事件推送。硬门控：非 GitHub remote 或凭据不可解析 ⇒ 零事件（未连接用户对功能无感知）。没有新提交的回合不发事件（防噪声）。检测绝不向回合抛错。
3. **`@Remote` 按钮方法**（design §6，零模型回合）：`connectStatus()`（带缓存的登录名查询）、`startDeviceFlow()`、`deviceFlowStatus()`、`disconnect()`、`prDraft()`（从领先 base 的提交确定性推导标题/描述预填）、`createPr()`（分支/base 取自 git，经 seam 幂等创建）、`mergePr()`（squash / merge / rebase；405/409 映射为 `GITHUB_MERGE_BLOCKED`）、供徽章轮询的 `prChecks()` 与 `refreshFlowState()`——轮询节奏由**前端**掌控，页面不可见即停。

### 配置

| 字段 | 默认值 | 语义 |
|---|---|---|
| `clientId` | 项目共享的 `dsh-github-connector` OAuth App | Device Flow 用的 client id（公开标识符，非密钥）。GHES 需覆盖为你实例上注册的 App。 |
| `credentialRef` | `GITHUB_TOKEN` | token 的存取位置（凭据 seam，env 回退）。 |
| `apiBaseURL` / `authBaseURL` | github.com 端点 | GHES：`apiBaseURL` 指向 `/api/v3`，`authBaseURL` 指向 GHES 主机。 |
| `host` | `github.com` | 工作区 remote 必须指向的主机，flow-state 的激活门槛。 |
| `cwd` / `baseBranch` | 发起会话的工作区，否则进程 cwd / remote HEAD | `cwd` 强制所有 git 检查落在同一目录（ADR-0010：正常情况由发起会话的 `header.cwd` 决定）；`baseBranch` 覆盖检测出的 base。 |
| `scope` | `repo` | Device Flow 请求的 OAuth scope。 |

### 事件（宿主内部，ADR-0009）

dsh 不向浏览器转发自定义宿主事件，因此下列事件仅服务宿主侧消费方；web UI 改为轮询 `refreshFlowState` 与 `deviceFlowStatus`。`deviceFlowStatus()` 返回当前流的最新 `DeviceFlowUpdate`（被替代流的更新会被丢弃，轮询方绝不会看到过期的终态）。

- `github/flow-state` —— 状态条的状态（上述四态）。
- `github/device-flow` —— `awaiting-authorization`（含 prompt）→ `slow-down`* → `authorized` | `expired` | `denied` | `failed`。

## Web UI（`dsh-github/ui`）

dsh web 客户端的 **GitHub 工作流 UI**（design §1）：两个 React slot 填充件，完全由连接行的 `@Remote` 方法加前端持节奏的轮询驱动（ADR-0009——dsh 不向浏览器转发自定义宿主事件；本 UI 唯一使用的转发事件是 `credentials/reference-updated`）。

1. **"Connect GitHub" 卡片**（作为 `settings.plugin.item` 卡片落在 dsh 插件 → 插件配置 页，ADR-0008）：[连接 GitHub] 启动 Device Flow——用户码自动复制、授权页自动打开，进度按服务端节奏轮询 `deviceFlowStatus` 获得（`slow_down` 时拉长间隔）；已连接用户看到 `已连接 @login` 与 [断开连接]。token 永不经过前端。
2. **对话 PR 状态条**（`conversation.input.dock` slot），Claude Code 风格的紧凑胶囊条、贴合会话列宽，即 design §1 的三阶段：`repo feat/x +N −M` + [创建 PR] + [×] → `#123 · CI 徽章` + [AI 审查] [Merge ▾]（squash / merge commit / rebase / 在 GitHub 打开）+ [×] → `#123 已合并`，短暂展示后收起。未连接用户不可见；断开连接后立即消失；[×] 收起胶囊直到状态变化。[创建 PR] 单击即经 `sessions.prompt` 交给 agent 回合——模型根据会话上下文归纳标题/描述并用 GitHub 工具创建，按钮保持 loading 至轮询状态迁移（超时兜底，ADR-0011）；[Merge] 直调 `@Remote` 并走不可逆确认；[AI 审查] 同样经 `sessions.prompt` 消耗回合。

两个轮询器都指数退避且**页面不可见时停止**：CI 徽章（`prChecks`）与 flow-state（`refreshFlowState`，未变化的轮次绝不关闭已打开的下拉、丢弃草稿或让已收起的合并横幅复现）——风险表中"轮询不能吃掉 rate limit"的规则。

### 绑定方式（ADR-0007/0008）

本行通过 `src/ui/types.ts` 的两份契约对接 web 客户端：**`GitHubUiShell` 端口**（slot 注册、`prompt`、`openExternal`、`copyText`、`confirmIrreversible`、页面可见性），以及手写的 `githubConnect` 命名空间 **Typert Remote 客户端面**，待 Typert 生成器跑过宿主包后原样替换。一次调用完成安装：

```ts
import { installGitHubUi } from 'dsh-github/ui'

const dispose = installGitHubUi(shellAdapter, typertClientRemote, { locale: 'zh-CN' })
```

### dsh client 半侧（`dsh-github/client`）

`src/ui/client/` 是该端口面向真实 dsh web 部署的成品实现（ADR-0008），采用 dsh client 插件形态：`./client` 导出加 `dsh.client` 清单、node 半侧（其 loader 行 `ui-github` 由 `dsh plugin add` 落位，锚定 dsh 的 client-module 扫描）、以及构建为 dsh 模块加载器执行的 CJS 闭包工厂的 `lib/client.js`（`scripts/build-client.mjs`；仅 react 与 cordis 保持 external）。启动时经 `ctx.remote.$mount` 自行挂载手写的 `githubConnect` contribution——无需改动 dsh 主仓——再经浏览器外壳适配器安装两个界面：设置填充件落为 `settings.plugin.item` 卡片，[AI 审查] 经 `ctx.sessions.scope(sessionId)` 送入会话，外链仅以 http(s) 新标签页打开，locale 跟随页面语言。所消费的 dsh 服务类型以 `src/ui/client/shims.ts` 垫片声明，迁入 dsh 工作区时删除。

### i18n

内建两个 locale（`en`、`zh-CN`）的完整目录（`catalogFor`）；两个 slot 的全部用户可见字符串成对维护。

## 测试

测试全程无需 token，且按行分套、per-file 100% 覆盖：

- `dsh-github/rest`：通过注入的 `fetch` 回放 fixture；真实 API 只读冒烟无 `GITHUB_TOKEN` 自动 skip。
- `dsh-github/tools`：在脚本化 provider 之上验证 schema、预算执行、审批结果与呈现。
- `dsh-github/connect`：Device Flow 各路径针对完全 mock 的 OAuth 端点运行；flow-state 迁移在每测试新建的 fixture git 仓库上运行；并验证凭据写入、`credentials/reference-updated` 广播、门控与无新提交防噪声规则。
- `dsh-github/ui`：组件测试在 jsdom 下用脚本化的假 Remote 与假外壳驱动——四个流状态、Device Flow 全程、退避与暂停节奏、agent 驱动的创建、[×] 的忽略记忆，以及 client 半侧（contribution codec、浏览器外壳、插件 apply）。

## Model Experience

传输与注册表是间接的，工具套件是直接的。模型看到一套 schema 严格而小巧的工具；在搜索命中与读取之间流转的可移植 `owner/repo` + `number` handle；为 token 开销调校的精简文本渲染；诚实的截断标记与恢复提示；以及被措辞为"答案"的写拒绝。系统提示词区块预先教会模型 part 拆分的 PR 读取与审批语义。

`github_pr_review` 是唯一一个交给模型**任务形状**而非数据的工具。被要求"审查这个 PR"时，放任模型自己发挥的结果是：读一遍 diff 然后即兴发挥，覆盖面每次都不一样，严重度全凭当下感觉，findings 落不到具体行上。这个工具用一份 brief 取代那种即兴：维度是**由改动本身确定性路由**出来的——纯文档 PR 永远不会被问类型设计——每个维度带 checklist，另有一套固定的严重度词汇和每条 finding 必须满足的契约。它不给裁决也不打分：被保证的是覆盖面与形状，判断仍然归模型（ADR-0013）。两个 UI 按钮与连接服务的存在，则是为了让连接、创建、合并 PR 完全不消耗模型回合；刻意例外的是 [AI 审查] 按钮。
