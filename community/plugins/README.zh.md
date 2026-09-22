# DeepSeek Harness 社区插件

[English](README.md) | 中文

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的社区维护插件源码。`packages/` 下的每个包都是可安装的 `dsh` bundle：

- [`dsh-desktop-panel`](packages/desktop-panel) —— 在浏览器里查看并操作本机桌面（含锁屏）。
- [`dsh-mode-router`](packages/mode-router) —— 为每轮对话分类，并把验证重点作为 agent 上下文注入。
- [`dsh-figma-mcp`](packages/figma-mcp) —— 接入 Figma：一路经 Figma REST API 只读设计稿与图片资源，一路经 Figma 桌面版插件桥读写画布。
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
