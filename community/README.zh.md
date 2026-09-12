# community — vendored 部署资产

[English](README.md) | 中文

本目录让 DeepSeek Harness 的检出目录在部署时自给自足：社区插件、agent（智能体）使用的 skill（技能），以及 web profile 的 manifest（元数据清单）都放在这里，位于 harness `packages/` pnpm 工作区之外（根 `pnpm-workspace.yaml` 的 glob 覆盖 `packages/*/*`、`vendor/*`、`apps/*` 和 `website`；`community/` 不属于其中任何一项，因此仓库根目录执行的 `pnpm install` 从不会尝试构建或把关这些外部包）。

## 布局

```
community/
  plugins/            vendored plugin workspace (source + built tarballs)
    packages/           codex-shell · manager · marketplace
    tarballs/           pinned installable .tgz artifacts
    scripts/            build/pack helpers
  skills/             installed skills, copied to $DSH_HOME/skills at boot
  home/               global home files, copied to $DSH_HOME/ (e.g. AGENTS.md)
  profiles/web/       template for $DSH_HOME/profiles/web (manifest only)
  seed.mjs            idempotent bootstrap, hooked into the repo's `dsh` script
  doctor.mjs          read-only host report; names the command that fixes each problem
  preflight.mjs       runtime versions, per-platform bundle limits, reachability probes
  profile.mjs         profile manifest build and repair
  README.md           this file
```

## 在全新主机上部署

只需使用标准的 DeepSeek Harness 命令：

```sh
git clone <this-repo> && cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

仓库的 `dsh` 脚本会先运行 `community/seed.mjs`。首次启动时，它依据 `community/profiles/web/` 写出 `$DSH_HOME/profiles/web`（把三个 `file:` 依赖解析到本检出目录的 `community/plugins/tarballs/`），把各个 skill 复制到 `$DSH_HOME/skills/`，把全局 home 文件（用户全局的 `AGENTS.md`）复制到 `$DSH_HOME/`，然后对 profile 执行 `pnpm install`。之后的启动只修复发生漂移的部分：由别的检出目录写下的 tarball 路径，以及本机装不上的组合包。模板之外由你自己添加的组合包永远不会被删除。可以用 `DSH_HOME=/path` 覆盖 home，用 `node community/seed.mjs --force` 重写整个 manifest，或用 `DSH_SEED_SKIP_INSTALL=1` 跳过 profile 安装。

## 部署前先做主机自检

`node community/doctor.mjs` 只检查、不修改任何东西，每项检查输出一行，并给出修复该项失败所需的命令。它覆盖 Node 与 pnpm 版本、Git、Windows PowerShell 执行策略、CPU 架构、GitHub 与注册表可达性、仓库依赖是否安装，以及 profile 是否仍与本检出目录一致。只要有任何一项失败，它的退出码就是非零，因此也可以作为脚本里的前置检查。

## 本机装不上的组合包

`seed.mjs` 绝不写出一份 `pnpm install` 必然失败的 profile。它会跳过每个在本机无法满足依赖的组合包，并打印原因：

- **注册表** —— 所选注册表已不再提供的固定版本，例如已被作者下架的包。
- **网络** —— 依赖是 `github:` 引用、而 github.com 不可达的组合包。
- **架构** —— 原生依赖没有为该平台与 CPU 发布二进制的组合包。

按平台划分的清单位于 `preflight.mjs`；当某个组合包新增原生依赖时，在表中补一行即可。

## 重新构建插件

`community/plugins/` 是一个独立的 pnpm 工作区。要重新构建其中一个：

```sh
cd community/plugins
pnpm install
pnpm build            # or pnpm -r run build
pnpm pack:check       # regenerates tarballs under each package's dist/
# copy the .tgz from packages/<pkg>/dist/ into community/plugins/tarballs/
```

## 网易内部包（自动检测）

`ntes-dsh-market` 和 `@dap-dsh-plugins/netease-auth` 只存在于 `https://npm.nie.netease.com/`（一个同时代理公共 npm 的公司内部注册表）。`seed.mjs` 会事先探测该注册表：

- **可达** → 完整 profile，使用内部 `.npmrc`。
- **不可达** → 跳过这两个组合包及其依赖，写出公共的 `registry.npmjs.org` `.npmrc`。

也可以跳过自动检测，强制做出选择：

```sh
node community/seed.mjs --force --internal   # internal registry + packages
node community/seed.mjs --force --public     # public registry, skip internal
```
