# dsh-figma-mcp

DeepSeek Harness 配置组合包：把 Figma 接入当前 profile。本包不含 Host 或 Client 入口代码，只提供一层 Loader patch，向 profile 插入两台已安装的 `@deepseek-ai/dsh-mcp-client`，各自挂一台互补的 MCP 服务器。

## 两条通道

| 通道 | 服务器 | 能力 | 依赖 |
|---|---|---|---|
| `figma` | [Framelink](https://github.com/GLips/Figma-Context-MCP) `figma-developer-mcp`（MIT，15.8k stars） | **只读**：`get_figma_data`、`download_figma_images` | 一个 Figma 个人访问令牌 |
| `figma-canvas` | [figma-ui-mcp](https://github.com/TranHoaiHung/figma-ui-mcp)（MIT，243 stars） | **读 + 写**：`figma_write`（在画布上创建/修改）、`figma_read`、`figma_status`、`figma_docs`、`figma_rules` | Figma 桌面版常驻 + 一次性导入开发插件 |

模型看到的工具名是 `mcp__figma__*` 与 `mcp__figma-canvas__*`。

两台可以独立启停：`plugin_manager` 的 `set_plugin` 分别控制 `mcp-figma` 与 `mcp-figma-canvas`。

## 通道一：只读（Framelink）

把 Figma 里画板或分组的链接贴进对话，然后说要实现成什么。模型自己解析链接里的 `fileKey` 与 `node-id`。

### 令牌

解析顺序：**启动环境里的 `FIGMA_API_KEY`** 优先，其次是 `~/.dsh/figma-api-key.txt`。

```sh
icacls "%USERPROFILE%\.dsh\figma-api-key.txt" /inheritance:r ^
  /grant:r "%USERNAME%:(R,W)" "SYSTEM:(R,W)" "BUILTIN\Administrators:(R,W)"
```

令牌在 Figma 网页版 **Settings → Security → Personal access tokens** 生成，权限至少包含 **File content: Read**。

两处都缺令牌时，`figma-developer-mcp` 以 `Either FIGMA_API_KEY or FIGMA_OAUTH_TOKEN is required` 退出，本服务器不注册任何工具，Harness 启动不受影响。

## 通道二：读写画布（figma-ui-mcp）

Figma 的 REST API 只能读，写画布必须走 Plugin API。官方 MCP 的写工具（`use_figma`、`create_new_file`、`generate_figma_design`、`upload_assets`、`generate_diagram` 等）全部标注 Remote only，桌面版本地服务器只有读工具——官方两条路都走不通。`figma-ui-mcp` 用插件补齐这段：插件在 Figma 内长轮询 `localhost:38451`，写操作经插件落到画布，**不需要 API 令牌**。

### 一次性安装 Figma 插件

1. 本组合包把插件产物固定在 `$DSH_HOME/figma-ui-mcp-plugin/`（Windows 上是 `C:\Users\<你>\.dsh\figma-ui-mcp-plugin\`）。它来自 `figma-ui-mcp@2.5.26` 的 npm 产物，需要重新获取时运行：

   ```sh
   npx -y figma-ui-mcp@2.5.26 --version   # 打印 npm 缓存里的 plugin 路径
   ```

2. 打开 **Figma 桌面版**（网页版无法访问 localhost）；
3. **Plugins → Development → Import plugin from manifest…**，选 `$DSH_HOME/figma-ui-mcp-plugin/manifest.json`（文件选择器不显示隐藏目录时，直接粘贴完整路径）；
4. 运行 **Plugins → Development → Figma UI MCP Bridge**，插件面板出现**绿点**即已连上。

之后每次要用画布能力，在 Figma 里运行一次该插件即可，不需要重复导入。

### 已验证的行为

让模型调 `figma_status`，返回 `pluginConnected: false` 并附带同一段提示时，说明桥接服务正常、只差插件未运行。

### 升级

服务器版本与插件产物必须成对更新：

```sh
npx -y figma-ui-mcp@latest --version    # 取新版本号与插件路径
```

改本包 patch 里的 `figma-ui-mcp@<版本>` 与固定的插件目录，然后按上文第 3、4 步在 Figma 里**重新导入**——插件不会自动更新。

## 为什么不接官方 Figma MCP 端点

Cursor 和 Codex 用的是官方远程端点 `https://mcp.figma.com/mcp`。它在 DSH 里不可用：

- Figma 的 MCP Catalog 只放行 VS Code、Cursor、Claude Code、Codex、Xcode，其他客户端需加入等待名单；
- 其授权服务器的动态客户端注册端点 `https://api.figma.com/v1/oauth/mcp/register` 对目录外客户端一律返回 `403 Forbidden`（2026-09-22 实测）；
- `dsh-mcp-client` 只支持静态请求头，不实现 OAuth 授权码与刷新流程。

官方给目录外客户端的替代品是 Figma 桌面版内置的本地服务器（`http://127.0.0.1:3845/mcp`），但它同样只有读工具，写画布仍需上面的插件桥。

## 改配置后如何生效

patch 改动由 HMR 热加载，不需要重启。**新写入的令牌文件不会自己触发重载**；写入后重新启用一次本 bundle 即可（`plugin_manager` 的 `set_bundle` 先 `enabled: false` 再 `true`）。

选环境变量方式时相反：`loadLayeredEnv` 只在启动时读取 `$DSH_HOME/.env` 与调用目录的 `.env`，改完必须重启 Harness。

## 限制

- 通道一只有读能力，且图片落盘位置由 patch 里的 `--image-dir` 固定（默认 `E:/KW/qtGit/deepseek-harness`）；换项目时改这一项。
- 通道二要求 Figma 桌面版常驻；桌面版关闭时服务器照常启动，只是工具调用会报插件未连接。
- 通道二的桥接端口固定为 `38451`，被占用时该服务器启动失败。
- 两个通道都需要网络能直连 `api.figma.com`（通道一）或本机回环（通道二）。走代理时在 `$DSH_HOME/.env` 里设置 `https_proxy`，`dsh-http-proxy` 会读取它。
- Framelink 遥测已通过 `FRAMELINK_TELEMETRY: off` 关闭。

## 许可

MIT
