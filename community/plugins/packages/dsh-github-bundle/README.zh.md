# dsh-github-bundle

[English](README.md) | 中文

GitHub 能力的聚合入口：让插件页只列一条，而不是五条。

## 它负责什么

只有一份 bundle patch：五行 `insert`，把 `dsh-github`、`dsh-github-rest`、`dsh-tool-github`、`dsh-github-connect`、`dsh-ui-github` 一起挂载。本包不含任何运行时代码。

## 为什么五个包仍然分开

`ctx.github` 是一条能力缝，而一条缝由 Service Definition、Service Provider、Consumer 三种角色构成——分开是为了让 provider 保持可替换（将来可以加入 GraphQL 或 GHES 专用 provider），也让 consumer 保持可选。本包只是选择把它们作为一个 bundle 一起挂载，不合并它们的代码。

行顺序不承载加载语义：激活由服务可用性驱动，任意安装顺序都能组合出同一个宿主。

## 开发

```sh
pnpm run typecheck
pnpm run build
```

## 许可证

[MIT](../../LICENSE)
