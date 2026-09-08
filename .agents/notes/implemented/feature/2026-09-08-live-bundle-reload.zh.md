# Agent Note: 已安装插件 Bundle 热加载

Status: implemented

中文 | [English](2026-09-08-live-bundle-reload.md)

## 问题

`dsh plugin add/remove` 通过转发 pnpm 并改写 profile `package.json` 里的 `dsh.profile.bundles` 来安装或卸载 bundle（例如 `dsh-codex-shell`）。运行中的服务只在启动时组合一次 bundle 补丁，因此 live profile 仍需重启才生效。

## 决策

Live profile 在每次 live 组合时重新读取 bundle 列表，而不是复用启动时快照：`composeLive` 调用 `loadProfile(..., { userLayer: false })` 并从当前 `layers` 重建补丁。`watchUserPatches` 增加 `load` 钩子以便 watcher 读取非补丁文件，boot 再为 profile `package.json` 增加一个 watcher；当 `dsh plugin add/remove` 改写它时，watcher 重新组合并 `entry.update` 对树做 diff，通过现有 Loader/HMR 路径加载新增 bundle 条目并卸载被移除条目。

`cordis.patch.yml` 与 home patch 层仍按代重读，`--patch` overlays 对本进程保持固定。

## 后果

`dsh plugin add/remove` 现在在运行中的 live profile 无需重启即可生效。`watchUserPatches` 接受可选的 `load` 读取器；未传入时保持默认 `loadOptionalPatches` 行为。
