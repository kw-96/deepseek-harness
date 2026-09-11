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

仓库的 `dsh` 脚本会先运行 `community/seed.mjs`。首次启动时，它依据 `community/profiles/web/` 写出 `$DSH_HOME/profiles/web`（把三个 `file:` 依赖解析到本检出目录的 `community/plugins/tarballs/`），把各个 skill 复制到 `$DSH_HOME/skills/`，把全局 home 文件（用户全局的 `AGENTS.md`）复制到 `$DSH_HOME/`，然后对 profile 执行 `pnpm install`。此后它只是一个快速的空操作。可以用 `DSH_HOME=/path` 覆盖 home，用 `node community/seed.mjs --force` 强制重新执行 seed，或用 `DSH_SEED_SKIP_INSTALL=1` 跳过 profile 安装。

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
