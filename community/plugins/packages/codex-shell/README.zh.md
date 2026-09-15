# dsh-codex-shell

[English](README.md) | 中文

DeepSeek Harness（DSH）的多 tab 交互式底栏终端，**单插件组合**：宿主 bottom 行里自带 `pwsh`/`bash` 终端，并可跟随 Agent 的 `terminal_*` 会话。Codex 式左侧导航栏（会话浏览器、项目层、添加工作区弹窗、新建会话页项目选择器）由单独的 [`dsh-workspace-rail`](../codex-left/README.zh.md) 提供；两者可组合使用，也可各自单独安装。

## 功能

- **底栏交互终端**（以 priority -1 占用宿主 `bottom` 行）：自带多 tab 终端，与模型侧行模式工具并行工作 —— 新标签创建 `pwsh`/`bash`，可跟随 Agent 的 `terminal_*` 会话，渲染用 `@xterm/xterm`。非活跃标签保持 follow，仅隐藏 DOM。行高、拖拽与动画由宿主布局接管；关闭按钮写回 `ctx.layout.closeBottom`。
- **会话头工具按钮**（`conversation.session.header.utilities`）：Web 渲染底部终端按钮；桌面独立窗口不渲染（该按钮由顶部栏放在窗口控制按钮左侧）。
- **视觉**：通过 `dsh-workspace-rail` 同款的 `--cx-*` 别名映射宿主 `--dsw-*` 主题令牌，自动跟随亮/暗主题。

右侧面板不属于本插件：它由宿主官方右栏（`ui-sidebar-right`）提供，Web 用右栏自带的会话头角落按钮开合，桌面独立窗口用顶部栏的右侧面板按钮。

## 与 dsh-workspace-rail 的组合

`dsh-workspace-rail` 的会话菜单通过本插件 `codexShell` Remote 的 `terminalOpen` 提供「在终端中打开」。服务名与 `terminalOpen(sessionId, options)` 签名是跨插件接口：改名必须与消费方同步。本插件不依赖 `dsh-workspace-rail` 的任何内容。

## 安装

```sh
dsh plugin --profile web add file:/path/to/community/plugins/tarballs/dsh-codex-shell-0.7.0.tgz
dsh plugin --profile web remove dsh-codex-shell
```

## 开发（源码 link + 热替换）

保持 `dsh web`（或桌面壳）运行，然后执行：

```sh
node community/plugins/dev.mjs codex-shell
```

脚本把插件以源码 link 挂载进 web profile，在 `cordis.patch.yml` 启用 Cordis HMR 并指向源码目录，随后启动 host/client 双面 watch 构建。之后改源码即可：host 侧由 Cordis HMR 热替换，client 侧由 `client-hmr` 推送浏览器热重载，无需重启服务或手动刷新。

也可以手动插入 profile 的 `cordis.patch.yml`：

```yaml
- insert:
    - id: codex-shell
      name: dsh-codex-shell
```

安装后重启 profile（`dsh web`）。插件/MCP/Skills 的查看与配置走宿主「设置 → 插件」页（需要 `dsh-plugin-manager` 等宿主能力）。

## 宿主 Remote

`ctx.remote.codexShell`（Typert）：

- `terminalOpen/terminalList/terminalFollow/terminalWrite/terminalResize/terminalRead/terminalClose`（底栏多 tab 终端；`terminalFollow` 是流式方法）
- `terminalSend`（行模式发送，供面板之外的消费方使用）

终端 PTY 会话归属于所请求会话的 live Agent（`ctx.terminals`，经 `ctx.agents` 限定归属）。

## 已知限制与待办

- 底栏终端需要 profile 挂载宿主终端能力（`@deepseek-ai/dsh-terminal` 及 `terminal-bash` 之类的 provider）；缺失时插件无法激活。
- 终端绑定当前会话的 live Agent：没有 live Agent 时面板显示「终端需要当前会话的 live Agent。」，不会创建游离 shell。
- `terminalSend`/`terminalRead` 面向面板之外的消费方；面板自身走流式路径。
