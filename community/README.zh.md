# community — vendored 部署资产

[English](README.md) | 中文

本目录让 DeepSeek Harness 的检出目录在部署时自给自足：社区插件、agent（智能体）使用的 skill（技能），以及 web profile 的 manifest（元数据清单）都放在这里，位于 harness `packages/` pnpm 工作区之外（根 `pnpm-workspace.yaml` 的 glob 覆盖 `packages/*/*`、`vendor/*`、`apps/*` 和 `website`；`community/` 不属于其中任何一项，因此仓库根目录执行的 `pnpm install` 从不会尝试构建或把关这些外部包）。

## 布局

```
community/
  plugins/            vendored plugin workspace (source + built tarballs)
    packages/           workspace-rail · codex-shell · manager · marketplace
    tarballs/           pinned installable .tgz artifacts
    scripts/            build/pack helpers
  skills/             installed skills, copied to $DSH_HOME/skills at boot
  home/               global home files, copied to $DSH_HOME/ (e.g. AGENTS.md)
  profiles/web/       template for $DSH_HOME/profiles/web (manifest only)
  seed.mjs            idempotent bootstrap, hooked into the repo's `dsh` script
  doctor.mjs          read-only host report; names the command that fixes each problem
  preflight.mjs       runtime versions, per-platform bundle limits, reachability probes
  profile.mjs         profile manifest build and repair
  portable.mjs        packs a built, configured deployment into one archive
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

## 每台主机一条命令

`node community/setup-host.mjs` 按顺序跑完上面的部署链，并且是幂等的——同一命令在全新 clone、已部署好的主机、以及只需要重建的主机上都可用：

| 模式 | 作用 |
| --- | --- |
| `check`（默认） | 依次运行 `preflight.mjs`、`doctor.mjs`、`portable.mjs check`、`verify-profile.mjs`，再做下面的已知陷阱检查。不改动任何东西。 |
| `install` | `pnpm install` → `pnpm run build` → `node community/seed.mjs` → 同一套自检，最后给出启动命令。 |
| `pack` | 转调 `portable.mjs pack`，供同架构、不想在目标机上构建的主机使用。 |

它不重复实现任何一步，价值在于**顺序**与**我们运维这套多主机时踩过的陷阱检查**——这些陷阱的共同特征是失败信息离根因很远：

- **组合漂移。** `verify-profile.mjs` 在不启动服务的前提下读取每个 bundle 的 patch：插入行 id 重复会直接判失败，行名在 profile、仓库、以及 bundle 自身依赖树三处都解析不到时给出报告。这正是「手工装的插件/半装状态的插件」在**下次启动之前**而非之后被拦下的那道检查。
- **pnpm 大版本漂移。** profile 的 `node_modules` 由 pnpm v10 安装、而当前 pnpm 是 v11 时，一旦添加插件就会报 `ERR_PNPM_UNEXPECTED_STORE`。检查会同时列出两个版本与修法：用 profile 对应的 pnpm 大版本安装，或在备份后有意地在 profile 内执行 `pnpm install` 整体重链。
- **git 托管的组合包。** 依赖里出现 `github:` 引用时，pnpm 会拦下构建脚本，需要在 profile 的 `pnpm-workspace.yaml` 里按精确 key 补 `allowBuilds`；检查会在安装失败之前报告缺失。
- **重启纪律。** 新增或修改插件的 Remote 方法后必须重启 `dsh web`：typert manifest 按包名缓存，HMR 不会刷新它。
- **升级前先存快照。** 装了 `dsh-undo-savepoint` 时，检查会打印升级或改插件前应执行的快照命令。

## 打便携包

`node community/portable.mjs pack` 写出一份 `tar.gz`，内含完整检出目录与构建产物、内置的 Node 与 pnpm、一份离线 pnpm store、已生成好的 profile（含全部插件）、技能与全局配置，以及把 `DSH_HOME` 固定在解压目录内的启动器。同架构的 Windows 主机**解压后直接双击 `DeepSeek Harness.exe`（或 `start.cmd`）即可**：不需要预装 Node 或 pnpm，不需要联网，首次启动自动从包内 store 离线安装，插件与配置随包生效。

- 产物按架构命名（`dsh-portable-x64-<日期>.tar.gz` / `dsh-portable-arm64-<日期>.tar.gz`），**只能在打包时的同一架构上运行**，因此请在目标架构的主机上打包。
- 检出的 `node_modules` 与 profile 的 `node_modules` 都不随包分发：pnpm 在 Windows 上把它们记成绝对 junction，无法被忠实归档。包内携带的是 store 与清单，目标机首次启动时离线重建这两棵树。
- 宿主 profile 里只靠开发 junction 存在的插件（没有依赖声明），打包时会从 `community/plugins/tarballs/` 解包后放进 `$DSH_HOME/profiles/node_modules` 共享回退目录，因此目标机不需要重装。
- 若 profile 固定了 registry 已下架的版本，打包会从**本机已安装的副本**重打成 `file:` tarball，而不是悄悄换版本，并在输出里说明。
- `node community/portable.mjs check` 用于检查本机是否具备打包条件。

## 本机装不上的组合包

`seed.mjs` 绝不写出一份 `pnpm install` 必然失败的 profile。它会跳过每个在本机无法满足依赖的组合包，并打印原因：

- **注册表** —— 所选注册表已不再提供的固定版本，例如已被作者下架的包。
- **网络** —— 依赖是 `github:` 引用、而 github.com 不可达的组合包。
- **架构** —— 原生依赖没有为该平台与 CPU 发布二进制的组合包。
- **无来源** —— 没有任何依赖声明、也没有任何模块目录能解析出的行，例如 `dsh-plugin-manager` 从自己的目录写入、却没有对应安装的那一行。

只有首次播种才会权衡注册表与网络，因为那时还没有任何已装好的东西可失去。修复已有 profile 时，仅按 CPU 架构与无来源行移除组合包，绝不依据可达性探测：已安装的组合包离线也能用，而误报某主机不可达会把它删掉。按平台划分的清单位于 `preflight.mjs`；当某个组合包新增原生依赖时，在表中补一行即可。

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
