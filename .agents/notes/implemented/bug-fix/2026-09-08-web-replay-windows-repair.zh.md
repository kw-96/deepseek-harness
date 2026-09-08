# Agent Note: Windows 上修复 Web 回放测试通道

Status: implemented

[English](2026-09-08-web-replay-windows-repair.md) | 中文

## Problem

`test:web` 浏览器通道在 Windows 上大面积失败：生成的种子夹具在解析期崩溃（`realizeSeedFixture` 用未转义的反斜杠替换 `{{cwd}}`）、aria 黄金无法归一化工作区 basename 与预设根（用 `split('/')` 处理反斜杠路径）、持久化回放比较漏掉沙箱策略快照中 JSON 双反斜杠拼写的 cwd、HMR 场景无法无 shell 启动 pnpm watcher、`pnpm run dev:web` 在 Node 24 下崩溃（tsdown 的 `import-without-cache` load 钩子与 tsx 加载器组合后对 `.cjs` 源返回 `undefined`）、`preview-boot` 从未成功提供打包镜像（Windows `path.normalize` 把前导分隔符变成覆盖表键所没有的反斜杠）。

## Decision

每个失败都做最窄的平台正确修复：

- `realizeSeedFixture` 对替换进 JSONL 的 cwd 做反斜杠转义，Windows 上种子可解析。
- `normalizeAria` 与预设创作的分词器按任一分隔符切分工作区 basename，并把后缀规范为 `/`。
- `session-snapshot` 的 `cwdSpellings` 增加 JSON 双反斜杠拼写，使策略快照文本归一化为 `{{cwd}}`。
- `hmr-live` 以无 shell 方式解析 pnpm watcher 调用：有 `npm_execpath` 用之，否则 Windows 走 `cmd /c pnpm`。
- `dev:web` 启动器从 tsx 改为原生 Node 类型剥离——脚本为纯可擦除语法，且这样消除了 tsx 与 `import-without-cache` 的钩子冲突（watcher 在 Node 24 崩溃的根因）。
- `preview-boot` 的静态响应器在 `normalize` 后剥离两种前导分隔符并把相对路径规范为 `/`；展示断言在等待文件链接前先展开每个紧凑折叠的所属轮次（已结束轮次默认折叠渲染）。
- 社区 dev 循环（`community/plugins/dev.mjs`）先创建 junction 目标父目录，作用域插件（`@ruihuahe/...`）在全新 profile 上也能挂载，不再以 `ENOENT` 失败；此前任何全新 home 的 `dsh web` 启动（包括 HMR 场景）都会因此到不了应用界面。
- `hmr-live` 在首次启动前把全新 home 钉为英文界面，并按真实首屏流程走完首启公告与工作区选择器后再等 hero，与全新 home 的实际表现一致。
- 记录夹具驱动 bash 工具、而随附预设仅在 POSIX 挂载 bash 的场景在 Windows 跳过：`cordis-tool-round`、`goal-multi-turn-actions` 与 chat-scroll 的两个实时工具用例，与既有 approval-composer/ptc-round 先例一致。

## Alternatives considered

**刷新 aria 黄金而不是修捕获归一化器。** 不采用：平台修复让已提交黄金在 Windows 上即能匹配，且输入框界面仍处于并发改版中，刷新会把进行中的 UI 状态固化进黄金。

**修复 tsdown/import-without-cache 而不是给 dev:web 去掉 tsx。** 不采用：缺陷在上游钩子组合（`import-without-cache@0.4.0` 把委托产生的 `undefined` 源原样返回），暂无修复版本；换启动器在不损失任何 dev:web 行为的前提下消除冲突。

**把整条 Web 通道限定在 POSIX。** 不采用：大多数场景与平台无关；上述修复让它们继续在 Windows 运行，bash 工具场景仍由 Linux PR 门禁覆盖。

## Consequences

Windows 可以运行 Web 回放通道：种子夹具、aria 黄金、持久化回放比较、HMR 与预览 worker 启动均可在本地通过；依赖 bash 的场景与先例一样保持 Linux 门禁。`pnpm run dev:web` 在原生 Node 下可用（受支持引擎区间内类型剥离已默认开启），并已通过一次端到端重建验证。通道的已提交黄金保持不变，等待进行中的输入框改版落地。
