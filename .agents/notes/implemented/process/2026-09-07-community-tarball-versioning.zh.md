# Agent Note: 运行时字节变化时为社区 tarball 更新版本

Status: implemented

[English](2026-09-07-community-tarball-versioning.md) | 中文

## 问题

Web profile 通过本地 `file:` tarball 安装 `dsh-codex-shell`。pnpm 会将该压缩包的完整性校验值记录在 profile 锁文件中，因此即使工作区和 manifest 都指向替换后的压缩包，在已有版本上直接替换字节仍可能让已安装 profile 加载较早的客户端 bundle。

## 决策

每个 `dsh-codex-shell` 运行时发布使用唯一的语义化版本和 tarball 文件名。Web profile 指向该精确压缩包，包 README 安装同一版本。面板变更只有在包完成构建且打包后的 `lib/client.js` 含有目标客户端模块时才可发布；源码、声明输出和 source map 不能替代该运行时检查。

## 备选方案

**不升级版本，直接替换既有 tarball。** 不予采用，因为已安装 profile 会保留锁文件中的完整性校验值，并可能在相同包版本下继续加载较早的字节。

**强制重新初始化每个既有 profile。** 不予采用，因为它依赖每台机器分别完成本地修复，且无法为变化后的产物提供独立的依赖标识。

**从源码目录安装插件。** 不予采用，因为 Web profile 设计为消费 `community/plugins/tarballs/` 中已固定且可移植的压缩包。

## 影响

每次客户端 bundle 变化都会增加带版本的压缩包，并在安装前更新 profile 依赖。既有 profile 安装新依赖后重启 `web` profile。本地压缩包规则补充了[私有 npm 发布作为三条独立序列](2026-08-10-npm-release-sequences.zh.md)中的 registry 完整性规则；没有任何活跃 Agent Note 被完全取代。
