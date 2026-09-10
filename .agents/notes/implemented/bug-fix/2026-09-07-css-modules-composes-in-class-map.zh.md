# Agent Note: CSS Modules 的 composes 必须进入 JS class map

Status: implemented

[English](2026-09-07-css-modules-composes-in-class-map.md) | 中文

## 问题

社区插件与 Host Client 的 CSS 管线用 lightningcss 编译 `.module.css`，再导出供 `import css from './x.module.css'` 使用的 class map。侧栏选中会话行在 `.rowCurrent` 上写了 `composes: row`，本意是高亮 class 同时带上基础行的 flex、padding 与状态槽布局。打包器只保留了 `export.name`、丢掉了 `export.composes`，于是 `css.rowCurrent` 只上了高亮色、没有基础行布局，标题在选中时往左窜。

## 决策

构建 JS class map 时，把每个导出的哈希名与所有 local / global 的 composed 名用空格拼在一起，对齐 lightningcss 文档中的 CSS Modules 约定。跨文件的 `composes … from` 仍不支持并失败大声：内联 stylesheet 插件不会解析其他 CSS 文件。共享助手：`scripts/css-module-class-name.ts`；调用方为 `packages/client/tsdown.client.ts` 与社区插件的 `tsdown.client.config.ts`。

## 曾考虑的替代方案

**停用 `composes`，一律手写 `className={\`${css.row} ${css.rowCurrent}\`}`。** 不作为主修复：大量 composed class 都要双写，下一位作者再用 `composes` 仍会静默丢样式。

**换成会自动解析 `composes` 的 CSS bundler。** 不采用：现有 lightningcss-in-tsdown 路径是共享的；修好导出 map 即可恢复约定，不必引入第二套 CSS 工具链。

## 后果

选中、归档及其他 composed 行保留基础布局。作者可继续对同文件 mixin 使用 `composes:`。新增跨文件 `composes … from` 会在构建期失败，直到引入 CSS bundler。
