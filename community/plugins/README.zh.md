# DeepSeek Harness 插件管理器

[English](README.md) | 中文

本仓库包含 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的社区插件 [`dsh-plugin-manager`](packages/manager)：它通过 Cordis HMR 在运行中的 profile 内热加载已安装的插件，并管理其启用状态与运行状态。

## 开发

```sh
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
pnpm run pack:check
```

软件包发布使用 `dsh-plugin-manager@<version>` 形式的标签。

## 许可证

[MIT](LICENSE)
