# Agent Note: Web e2e 的 bash 场景仅限 POSIX

Status: implemented

[English](2026-09-06-web-e2e-bash-lane-posix-only.md) | 中文

## 问题

组装的 Web e2e 通道（`pnpm run test:web`）在 Windows 开发机上整批失败：驱动或回放 `bash` 工具调用的套件报 `unknown tool "bash"`；shipped-composition 的目录断言期望 `bash`，而 Windows 组合注册的是 `pwsh`；plugin-config 段落断言的终端超时默认值也随平台不同。这些失败看起来像回归，实为通道的平台假设被触发：preset 只在 POSIX 上挂载 `dsh-tool-bash`（`disabled: !!js process.platform === 'win32'`）、只在 Windows 上挂载 `dsh-tool-pwsh`，因为 base bundle 在 POSIX 上以 `bash-sandbox` 提供 `ctx.shell`、在 Windows 上以 `pwsh-sandbox` 提供。此外，一次 Windows 的 refresh 把会话夹具重录成了带 Windows 临时路径的版本，重放比较随即在下一次运行中拒绝它们。

## 决策

bash 依赖的 Web e2e 套件在测试自身中声明为仅限 POSIX。每个驱动或回放 `bash` 工具的套件——`shipped-composition`（目录与后台任务生产者用例）、`minimal-preset`、`ptc-round`、`replay-round-trip`、`turn-tail-actions`、`approval-composer` 与 `chat-continuous-conversation`——在 Windows 上用 `describe.skipIf(process.platform === 'win32')` 跳过（仅部分用例依赖 bash 的文件用逐用例 `it.skipIf`），并在注释中写明原因是 preset 的平台拆分。`plugin-config` 不再硬编码 POSIX 超时默认值：终端的组合默认值在 `bash-sandbox` 下为 `60000`，在 Windows 的 `pwsh-sandbox`（继承 `pwsh-local` 默认值）下为 `120000`，按 `process.platform` 选择。Linux CI 通道不受影响：跳过只作用于 Windows，夹具保持 Linux 录制的内容。一次 Windows 的 refresh 录入了被污染的会话夹具；该提交已回退，夹具仍由 Linux 撰写（重录属于测试策略所辖的 macOS/Linux 通道）。

## 已考虑的替代方案

### 修改测试让 bash 在 Windows 上运行

preset 有意在 Windows 上用 `pwsh` 取代 `bash`；让通道在 Windows 上组合 bash 会测试一个没有任何已发布 Windows 部署运行的组合，并且需要针对人造组合重录全部夹具。不予采用。

### 在 Windows 上重录夹具并归一化 Windows 路径

在 Windows 上录制会把 Windows 临时路径与 pwsh 目录固化进夹具，而 Linux 通道会逐字比较它们；归一化会掩盖真实漂移，并违背“夹具在 macOS/Linux 上回放”的策略。不予采用；被污染的重录提交已回退。

## 后果

- Windows 本地运行 `test:web` 不再因平台无法演练的场景而失败；被跳过的套件以 skipped 报告，平台拆分在注释中点明。
- `preview-boot` 的打包 worker 场景是唯一没有平台门禁的 Windows 失败：其 240 秒启动预算被本地缓慢启动超过，它保持为 Linux 拥有的计时预算。
- 回形针按钮的 UI golden 仍需在 macOS/Linux 上重录；Windows 的重录已随夹具一并回退，该刷新属于 CI 通道或 POSIX 机器。
