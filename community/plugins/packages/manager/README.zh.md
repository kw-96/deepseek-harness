# DeepSeek Harness 插件管理器

[English](README.md) | 中文

**DeepSeek Harness Plugin Manager** 是面向 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness) 及其 Cordis 插件运行时的 Web 插件管理器。它的标志性能力是在运行中的 profile 内实现由 Cordis HMR 支撑的热加载，同时可以在 Harness 的插件设置页中完成查看、搜索、启用、停用、分组和批量管理。

这是社区项目，不是 DeepSeek Harness 官方软件包。

## 功能

- **运行时热加载**：通过宿主已有的 Cordis HMR 应用启停变更，等待 Loader 生命周期收敛，并反馈权威结果。
- 查看当前 Cordis Loader 条目与生命周期状态。
- 启用或停用单个插件，而不删除其 npm 软件包。
- 按自动判定的“官方 / 第三方”分类展开条目，批量切换组内所有可修改条目，或按配置名称管理单个 Loader 条目。
- 把目标状态持久化到当前 profile 的 `cordis.patch.yml`，使其在重启后依然生效。
- 在 **MCP** 设置标签页中管理当前 profile 的 `mcp-client` 行所对应的 MCP 服务器。
- 在 **Skills** 设置标签页中列出用户技能根目录下的技能，并按技能切换模型调用。
- 保护管理器自身以及 Web 管理界面，避免被意外关闭。
- 复用 Harness 现有的受信任宿主传输策略；插件不会另开服务器。
- 提供英文与简体中文两种 Web 界面。

## 安装

把该软件包安装到 `web` profile：

```sh
dsh plugin --profile web add dsh-plugin-manager
dsh --profile web
```

打开 **设置 -> 插件**。管理器会新增三个标签页：插件列表（替代 Harness 原有的只读列表，在保留运行时状态可见的同时加入分类分组、搜索和启停控件）、MCP 服务器，以及 Skills。之后移除软件包使用：

```sh
dsh plugin --profile web remove dsh-plugin-manager
```

本地源码检出或 tarball 安装：

```sh
pnpm install
pnpm run build
pnpm --filter dsh-plugin-manager pack
dsh plugin --profile web add ./packages/manager/dsh-plugin-manager-0.1.0.tgz
```

通过 Git 安装会执行 `prepare` 构建，在 pnpm 10 及更高版本中需要显式授权构建脚本。已发布的 npm 软件包和 tarball 已包含 `lib/`，不需要安装时的构建权限。

## 行为与安全

“停用”意味着持久化 `disabled: true` 并请求 Cordis 停止已配置的插件，而不是卸载依赖。运行时热加载是管理器的标志性行为：在其生命周期允许时，普通叶子插件会在运行进程内被切换。如果目标状态已保存，但在超时前没有收敛，界面会提示需要重启 profile，而不会把已保存的变更视为失败。安装新插件或修改依赖仍需要重启 profile。管理器只写入自己标记的 patch 行，不改动用户编写的行。如果本地条目 id 存在歧义，操作会失败，而不是修改错误的插件。

默认情况下，管理器会保护自身条目及其 Loader 祖先、根 Include 与 profile HMR 服务，以及 API 网关、Web 服务器、客户端运行时、设置外壳、客户端模块加载器、连接、语言和 Host runner。这些条目维系着 profile 变更和管理页面本身，无法从该页面安全停用。它还会保护 `ui-settings-plugin-inventory`，即其 bundle patch 所替代的只读列表：管理器的标签页占用同一批 `settings.plugins.tab` 单元，因此重新启用该条目会因标签 id 重复而导致 Loader 失败。可以通过 Cordis 行配置补充部署专属的 id：

```yaml
- id: dsh-plugin-manager
  name: dsh-plugin-manager
  config:
    protectedEntries: [my-auth-provider]
    settleTimeoutMs: 8000
```

Web API 沿用与 Harness 连接相同的受信任宿主判定。任何被允许使用受信任 Web 控制面的人都能调用插件启停，因此不要把 Harness Web 服务器暴露给不可信网络。

## 分类与条目名称

列表分两级。顶层是自动的，且从不读取软件包元数据：仓库内置的 [`OFFICIAL_PACKAGE_REGISTRY`](src/host/official-package-registry.ts) 记录了来自已审查的 `deepseek-ai/deepseek-harness` 源码快照及其官方 bundle 依赖的精确模块根。这些条目归入 **官方**；其余所有已安装软件包（包括本社区管理器）归入 **第三方**。两个顶层分组即使为空也会保留可见。只有在审查新的官方 Harness 发布版时才更新该注册表。

在每个顶层分组内部，条目归属于一个功能子组，并且每个条目都会以一行说明显示其软件包 `description`：

- **官方**子组与说明来自仓库内置的 [`official-package-index.ts`](src/host/official-package-index.ts)，它把每个注册表根映射到其在 harness 中的 `packages/<group>/` 目录和 `package.json` 描述。生成脚本 `scripts/gen-official-index.mjs` 会从已审查的 Harness 源码树重新生成它，因此官方文案是经过审查且确定性的——绝不从运行中的 profile 读取。
- **第三方**子组来自软件包的 `dsh.pluginManager.group` 声明（小写字母、数字、点、下划线和连字符）；没有该声明的软件包归入 **未分组**。第三方说明以尽力而为的方式从已安装软件包的 `package.json` description 读取。

子组默认折叠，并直接按其配置 id 列出 Loader 条目，例如 `include`、`timer` 和 `tool-web`；导入的模块标识符会被刻意隐藏。顶层分组开关会改变每个可修改条目并跳过受保护的基础设施。绿色表示全部启用，黄色表示该分组部分启用。

## 开发

```sh
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
pnpm run pack:check
```

## 发布

推送 `dsh-plugin-manager@X.Y.Z` 标签会为 `packages/manager` 运行 `.github/workflows/publish.yml`。该工作流会校验标签与软件包版本一致，运行测试、类型检查和构建门禁，并通过 GitHub OIDC 使用 npm 可信发布完成发布。它不使用长期有效的 `NPM_TOKEN`。

使用该工作流之前，需要在 npm 软件包上配置可信发布者：GitHub 所有者 `hrhgit`、仓库 `deepseek-harness-plugin-manager`、工作流文件名 `publish.yml`、不设置环境，并只允许 `npm publish` 操作。npm 仅在已存在的软件包上提供该设置，因此最初的 `0.1.0` 发布必须先使用一个对本软件包有权限、且已启用 **Bypass two-factor authentication** 的细粒度访问令牌完成。随后应立即配置可信发布并撤销该引导令牌。

后续每次发布，先更新并提交版本，然后推送该提交及其标签：

```powershell
pnpm --filter dsh-plugin-manager exec npm version patch
git tag "dsh-plugin-manager@<version>"
git push origin main --tags
```

该软件包包含一个 Host 入口、一个浏览器入口、生成的 Typert Remote 产物，以及一个 `dsh.bundle` patch。它面向预发布的 `0.1.x` Harness API；升级 peer 依赖前请先阅读发布说明。

插件发现和 npm 安装由本仓库中独立的 `@ruihuahe/dsh-plugin-marketplace` 软件包负责。管理器仍然专注于已安装插件的启停与运行时状态。

## 可发现性

建议的 GitHub topics：`dsh-plugin`、`deepseek-harness`、`dsh`、`cordis`、`plugin-manager`、`plugin-management`、`web-ui`、`deepseek`、`typescript`。

能够准确描述本项目的搜索词包括 **DeepSeek Harness plugin manager**、**DSH plugin management Web UI**、**Cordis plugin enable and disable** 和 **DeepSeek Harness plugin bundle manager**。

## 许可证

[MIT](LICENSE)
