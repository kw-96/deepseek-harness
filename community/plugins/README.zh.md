# DeepSeek Harness 社区插件

[English](README.md) | 中文

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的社区维护插件源码。`packages/` 下的每个包都是可安装的 `dsh` bundle：

- [`dsh-desktop-panel`](packages/desktop-panel) —— 在浏览器里查看并操作本机桌面（含锁屏）。
- [`dsh-github`](packages/dsh-github) —— 抽象的 GitHub 能力缝（`ctx.github`）：provider 注册表、执行期解析、归一化读写词汇与 `GitHubError` 分类。由 [kaziii/dsh-github-connector](https://github.com/kaziii/dsh-github-connector) 适配 0.1.7 而来。
- [`dsh-github-connect`](packages/dsh-github-connect) —— GitHub Device Flow 连接、流程状态识别与远程按钮方法。
- [`dsh-github-rest`](packages/dsh-github-rest) —— GitHub REST v3 provider：直连 fetch（不依赖 octokit）、按操作解析凭据、Link 头分页与 GHES base URL 支持。
- [`dsh-tool-github`](packages/dsh-tool-github) —— 面向模型的 `github_*` 工具集。
- [`dsh-ui-github`](packages/dsh-ui-github) —— GitHub 工作流界面：「连接 GitHub」设置页与会话内的 PR 状态条。
- [`dsh-mode-router`](packages/mode-router) —— 为每轮对话分类，并把验证重点作为 agent 上下文注入。
- [`workorder-agent`](packages/workorder-agent) —— 易协作工单巡检、字段复核、POPO 通知与控制面面板。

## 开发

```sh
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
pnpm run pack:check
```

软件包发布使用 `<包名>@<版本>` 形式的标签。

## 许可证

[MIT](LICENSE)
