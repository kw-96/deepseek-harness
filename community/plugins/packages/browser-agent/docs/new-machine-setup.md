# 新机器装配 runbook（dsh-browser-agent）

给「在一台新机器上把 browser-skill + 本插件跑起来」的执行说明。按顺序做，每步都有可验证的判据。
面向人工或 agent 执行；命令以 Windows PowerShell 为例。

## 验收标准

三条同时成立才算装好：

1. `bsk doctor` 没有 `fail` 行，且没有版本偏差（扩展与 daemon 协议一致）；
2. DSH 的工具表里能看到 12 个 `browser_*` 工具；
3. 让模型执行一次「打开 https://example.com 并读标题」能成功，结束后 Agent Window 自动关闭。

## 前置

- Windows（本 runbook 只覆盖 Windows；上游另有 `install.sh` 供 macOS/Linux）；
- Node `^22.19 || >=24` 与 pnpm；
- 本仓库（DSH fork）已在机器上，且 `dsh web` 可正常启动。

## 步骤 1：准备 CLI 与 skill

```powershell
# 自检（不改动机器）：CLI 版本、daemon、扩展连接与协议一致性
.\community\plugins\packages\browser-agent\scripts\setup-browser-skill.ps1

# 安装/升级：已装 bsk 时走官方自更新，缺失时调用上游 installer（含 sha256 校验与 PATH 配置），
# 随后执行 bsk install-skill --yes
.\...\setup-browser-skill.ps1 -Mode install -ExtensionMode none
```

手动等价命令（不想用脚本时）：

```powershell
irm https://raw.githubusercontent.com/Tencent/BrowserSkill/main/install.ps1 | iex
bsk install-skill --yes
```

判据：`bsk --version` 有输出；`bsk doctor` 中 `agent skill up to date` 行为 ok。
说明：`bsk install-skill` 的目标 harness 列表里**没有 DSH**，DSH 是通过扫描 `~/.agents/skills` 拿到 skill 的。

## 步骤 2：安装浏览器扩展（必须由人完成）

上游明确说明 agent 不能代装扩展。三条路径：

| 路径 | 做法 | 适用 |
| --- | --- | --- |
| 商店（推荐） | 安装 [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/browserskill/emacgiaaaiojkkpkddmmdfhmokgmnikg) 或 [Chrome Web Store](https://chromewebstore.google.com/detail/hhcmgoofomhgciiibhipgmgkgnoenaoi) 版本，装完打开扩展弹窗等它变绿 | 个人机器，能上商店 |
| 离线解压 | `.\...\setup-browser-skill.ps1 -Mode extension -ExtensionMode unpacked -ExtensionVersion 0.2.1` 下载并解压，然后在 `edge://extensions` 开开发人员模式 → 加载解压缩的扩展 → 选该目录 | 无法上商店 / 内网 |
| 企业策略（批量） | `.\...\setup-browser-skill.ps1 -WriteEdgePolicy` 写入当前用户的 Edge 强制安装策略（`HKCU\Software\Policies\Microsoft\Edge\ExtensionInstallForcelist`），重启 Edge 生效；`-RemoveEdgePolicy` 撤销 | 批量新机、静默安装 |

判据：自检输出里 `extension connected` 为 ok，且**没有**「扩展版本落后」的 warn。
注意：不要同时保留商店版与解压版，两个扩展会争同一个 daemon。

## 步骤 3：把插件挂进 profile

```powershell
cd E:\KW\qtGit\deepseek-harness
# 建立 junction（node_modules/dsh-browser-agent → 插件源码）、写入 bundle 列表、启动 watch
node community/plugins/dev.mjs
```

再确认 profile 的 patch 行已启用（dev.mjs 只管 bundle 列表；loader 组合靠这一行）：

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- { id: browser-agent, name: dsh-browser-agent, disabled: false }
```

**新增 bundle/patch 条目不会被运行中的实例热应用，必须重启一次 `dsh web`。**
（实测：停用 `tool-todo` 后 `todo_write` 仍在、停用 git-timeline 后其右栏标签仍在。）
之后改插件源码则不必重启——Cordis HMR 会热替换（watch 重建 → 运行进程生效）。

## 步骤 4：验收

1. `.\...\setup-browser-skill.ps1` → 输出「全部通过」；
2. 工具表（`cordis_inspect_query` 的 Tool.listTools 或问模型）里出现 12 个 `browser_*` 工具；
3. 右栏出现「浏览器」标签，点开显示会话状态、标签页、最近截图与「结束会话」按钮；
4. 真实流程：`browser_open` → `browser_click` → `browser_status`（应显示 `ownedSessions: 1`）→ `browser_stop` →
   `browser_status` 应显示 `ownedSessions: 0`；shell 侧 `bsk session list --json` 应为空。

## 已知坑（都踩过，脚本已内建规避）

| 现象 | 原因 | 规避 |
| --- | --- | --- |
| `bsk` 命令打印完不退出 | CLI 自启 daemon 时子进程继承了 stdout 管道，调用方等管道 EOF | 先 `bsk daemon start`（自动 detach），或把输出重定向到文件 |
| PowerShell 取不到 `bsk` 的退出码 | PS 5.1 下 `Start-Process -PassThru` 的进程对象没有 `ExitCode`（无参 `WaitForExit()`/`Refresh()` 都无效） | 按输出内容判定结果 |
| `.ps1` 中文乱码 / 语法报错 | PS 5.1 默认按 ANSI(GBK) 读脚本 | 脚本保存为 **UTF-8 with BOM** |
| `bsk` 输出 JSON 解析失败 | 同上：按 ANSI 读 UTF-8 输出导致乱码 | 读输出时显式 `-Encoding UTF8` |
| 新插件挂载后工具不可见 | bundle/patch 新增不会被运行实例热应用 | 重启一次 `dsh web` |
| 改了 remote 方法面但界面没变 | typert manifest 按包名缓存且永不过期 | 重启 `dsh web` |
| 整页截图失败（`cdp_failed: image readback failed`） | **仅 0.1.x 扩展**在本机 Edge 上有限制；0.2.1 起整页截图已可用 | 插件先重试一次，再回退为根节点截图（旧版 aria 快照才有根节点引用） |
| 验收中途会话莫名消失 | 在 dev.mjs watch + HMR 下跑 `pnpm test`/`typecheck` 会重建 `lib/`，触发插件热替换，卸载时会按设计停掉插件自己的会话 | 验收流程中间不要跑测试/类型检查；或先停 dev.mjs |
| 观测文本是 `@vom/@view/@layers` 且引用只标交互元素 | 0.2.x 改用了 VOM 语义观测（0.1.x 是逐节点带引用的 aria 树） | 插件已兼容两代格式（标题解析、根节点引用回退都按格式分支） |
| 点击偶发「无反应」（页面收不到 click、URL 不变） | 0.2.x 扩展会在页面注入固定定位、`pointer-events: auto` 的 `<browser-skill-overlay>`；它处于 blocking（人工接管）或扩展刚重载时会短暂吞掉自动化点击 | 重试一次即可；确认 Agent Window 未被人工接管。点击链路本身正常：实测坐标与元素几何一致（`getBoundingClientRect` 中心），同坐标在本地探针页上按钮/链接均可点，`bsk click` 成功时页面会正常跳转 |
| 与 watch 同时跑 `pnpm run build` 出现 `UNRESOLVED_ENTRY` | build 会先 clean 掉 `lib/`，与增量构建竞态 | 先停 dev.mjs，构建完再启动 |
