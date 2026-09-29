# DeepSeek Harness 社区插件

[English](README.md) | 中文

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的社区维护插件源码。`packages/` 下的每个包都是可安装的 `dsh` bundle：

- [`dsh-desktop-panel`](packages/desktop-panel) —— 在浏览器里查看并操作本机桌面（含锁屏）。
- [`dsh-github`](packages/dsh-github) —— 整个 GitHub 连接器收在一个包里：`ctx.github` 能力缝、它的 REST v3 provider、面向模型的 `github_*` 工具集、Device Flow 连接与工作流界面，通过 `exports` 子路径（`dsh-github/rest`、`/tools`、`/connect`、`/ui`）挂成五行宿主插件。由 [kaziii/dsh-github-connector](https://github.com/kaziii/dsh-github-connector) 适配 0.1.7 而来。
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
