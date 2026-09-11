# DeepSeek Harness 插件管理器与市场

[English](README.md) | 中文

这个仓库包含两个互相独立的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 社区插件：

- [`dsh-plugin-manager`](packages/manager) 通过 Cordis HMR 在运行中的 profile 内热加载已安装的插件，并管理其启用状态与运行状态。
- [`@ruihuahe/dsh-plugin-marketplace`](packages/marketplace) 发现、检查并安装 npm 插件组合包，其软件包与仓库事实均经过校验。

本仓库不定义自己的插件规范。自动生成的 [`catalog/v2`](catalog/v2) 从 `dsh-plugin` 话题仓库中发现软件包 manifest；GitHub Actions 集中校验确切的 npm 版本与仓库归属，并记录已发布的软件包是否声明官方 `dsh.bundle` 元数据。市场运行时只读取该生成结果。

## 开发

```sh
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
pnpm run pack:check
```

软件包发布使用 `dsh-plugin-manager@<version>` 或 `dsh-plugin-marketplace@<version>` 形式的标签。

## 许可证

[MIT](LICENSE)
