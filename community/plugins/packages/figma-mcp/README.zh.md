# dsh-figma-mcp

DeepSeek Harness 配置组合包：把 Figma 接入当前 profile，模型因此获得 `mcp__figma__*` 工具，可以读取 Figma 设计稿并据此生成代码。

本包不含 Host 或 Client 入口代码，只提供一层 Loader patch，向 profile 插入已安装的 `@deepseek-ai/dsh-mcp-client`，由它连接开源的 [Framelink Figma MCP](https://github.com/GLips/Figma-Context-MCP)（`figma-developer-mcp`，MIT，15.8k stars）。它经 Figma REST API 工作，不依赖 Figma 桌面版、不占 Figma 席位、不受官方 MCP Catalog 白名单限制。

## 它给你什么

| 工具 | 用途 |
|---|---|
| `mcp__figma__get_figma_data` | 读取文件、画板或分组的布局、样式与组件数据 |
| `mcp__figma__download_figma_images` | 下载设计稿里的图片资源到本地 |

用法是把 Figma 里某个画板或分组的链接贴进对话，然后说要实现成什么。模型自己解析链接里的 `fileKey` 与 `node-id`。

## 令牌

令牌解析顺序：**启动环境里的 `FIGMA_API_KEY`** 优先，其次是 `~/.dsh/figma-api-key.txt`。

日常只需后者：

```sh
# 只有本人能读；Windows 上建议同时收紧 ACL
icacls "%USERPROFILE%\.dsh\figma-api-key.txt" /inheritance:r ^
  /grant:r "%USERNAME%:(R,W)" "SYSTEM:(R,W)" "BUILTIN\Administrators:(R,W)"
```

令牌在 Figma 网页版 **Settings → Security → Personal access tokens** 生成，权限至少包含 **File content: Read**。

两处都缺令牌时，`figma-developer-mcp` 会以 `Either FIGMA_API_KEY or FIGMA_OAUTH_TOKEN is required` 退出，本服务器不注册任何工具，Harness 本身不受影响。

## 安装

```sh
dsh plugin --profile desktop add file:<本目录绝对路径>
```

或让 Creator 模式的 Agent 调用 `plugin_manager` 的 `install_bundle`，把本目录的绝对路径作为 `target`。

安装后确认模型工具列表里出现 `mcp__figma__*`。

## 改配置后如何生效

`reconnect` 之外的 patch 改动由 HMR 热加载，不需要重启。**令牌文件是新写入的，不会自己触发重载**；写入后重新启用一次本 bundle 即可（`plugin_manager` 的 `set_bundle` 先 `enabled: false` 再 `true`）。

选环境变量方式时相反：`loadLayeredEnv` 只在启动时读取 `$DSH_HOME/.env` 与调用目录的 `.env`，改完必须重启 Harness。

## 为什么不接官方 Figma MCP 端点

Cursor 和 Codex 用的是官方远程端点 `https://mcp.figma.com/mcp`。它在 DSH 里不可用：

- Figma 的 MCP Catalog 只放行 VS Code、Cursor、Claude Code、Codex、Xcode，其他客户端需加入等待名单；
- 其授权服务器的动态客户端注册端点 `https://api.figma.com/v1/oauth/mcp/register` 对目录外客户端一律返回 `403 Forbidden`（2026-09-22 实测）；
- `dsh-mcp-client` 只支持静态请求头，不实现 OAuth 授权码与刷新流程，即便拿到端点也无法维持令牌。

官方给目录外客户端的替代品是 [Figma 桌面版内置的本地服务器](https://developers.figma.com/docs/figma-mcp-server/local-server-installation/)（`http://127.0.0.1:3845/mcp`）。它不需要令牌，但要求 Figma 桌面版常驻运行，并在 Dev Mode 的 inspect 面板里手动启用 MCP server，因此没有被设为本包的默认接入方式。

## 限制

- 只有读能力：走 Figma REST API，模型能读设计稿，不能在画布上绘制或修改。
- 图片落盘位置由 patch 里的 `--image-dir` 固定（默认 `E:/KW/qtGit/deepseek-harness`）；换项目时在 patch 里改这一项。
- 遥测已通过 `FRAMELINK_TELEMETRY: off` 关闭。
- 需要网络能直连 `api.figma.com`；走代理时在 `$DSH_HOME/.env` 里设置 `https_proxy`，`dsh-http-proxy` 会读取它。

## 许可

MIT
