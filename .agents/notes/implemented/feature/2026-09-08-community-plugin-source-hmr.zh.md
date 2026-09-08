# Agent Note: 社区插件源码 link 热替换

Status: implemented

[English](2026-09-08-community-plugin-source-hmr.md) | 中文

## 问题

社区插件（`dsh-codex-shell` 等）以 tarball bundle 装进 profile 的 `node_modules`。Cordis HMR 的模块热替换依赖扫描会跳过 `node_modules`，因此改插件源码后重打 tarball 也无法热替换 host 侧模块；client 侧虽经 `client-hmr` 重载，但完整闭环仍要手动步骤。

## 决策

`community/plugins/dev.mjs` 发现全部社区 bundle 插件，把每个以文件系统 junction 挂载进 web profile 的 `node_modules`（非 Windows 为 symlink），绕开 pnpm 的 `link:` 解析，在 profile `cordis.patch.yml` 追加启用 `hmr` 行并把 `root` 指向插件源码，再启动每个插件的 host/client `tsc --watch` 与 `tsdown --watch` 阶段。`profile-boot` 在启动 `web` profile 时只要脚本存在就 spawn 它，因此 `dsh web` 与桌面壳启动即已带热替换循环；没有源码树的发布环境没有该脚本，自然跳过。boot 拥有的 shutdown 会 kill 该 watch 进程。模块经源码挂载解析（不走安装副本）后，Cordis HMR 热替换 host 模块，`client-hmr` 热重载 client bundle，改代码即可生效，无需重启服务或刷新页面。

## 备选方案

**每次改动都重打 tarball 并重启。** 不采用：每次仍需打包、重装 profile、重启服务；host 侧永不热替换，闭环仍是手动的。

**放宽 Cordis HMR 依赖扫描以包含 `node_modules`。** 不采用：跳过 `node_modules` 是有意行为——把热替换限定在源码模块、不进入已安装包；放宽它会把发布插件布局与源码路径混在一起。

**改为 watch 并把构建出的 `lib/` 拷回 `node_modules`，而不是 link。** 不采用：拷贝后的文件仍在 `node_modules` 下，HMR 扫描仍会跳过，且半程拷贝会留下半更新状态。

## 后果

开发循环与运行中的 `dsh web` / 桌面壳并存。它会改写 profile 的 `cordis.patch.yml`（`hmr` 行），并在保留 `file:` tarball 依赖 spec 的同时，把 `node_modules` 下的插件目录替换为指向源码目录的 junction；因此安装后的 profile 与发布 tarball 布局不同，直到操作者移除 junction 并重装 tarball 才会恢复。
