# DeepSeek Harness 社区插件

[English](README.md) | 中文

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的社区维护插件源码。`packages/` 下的每个包都是可安装的 `dsh` bundle：

- [`dsh-desktop-panel`](packages/desktop-panel) —— 在浏览器里查看并操作本机桌面（含锁屏）。
- [`dsh-github-bundle`](packages/dsh-github-bundle) —— GitHub 能力的聚合入口：它一起挂载能力缝（`packages/dsh-github`）、REST v3 provider（`packages/dsh-github-rest`）、面向模型的 `github_*` 工具（`packages/dsh-tool-github`）、Device Flow 连接（`packages/dsh-github-connect`）与工作流界面（`packages/dsh-ui-github`）。这五个包仍各自独立，provider 因此保持可替换；聚合入口只是选择把它们作为一个 bundle 挂载。由 [kaziii/dsh-github-connector](https://github.com/kaziii/dsh-github-connector) 适配 0.1.7 而来。
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
