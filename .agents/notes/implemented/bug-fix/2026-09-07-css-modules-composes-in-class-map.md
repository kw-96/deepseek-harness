# Agent Note: CSS Modules composes must land in the JS class map

Status: implemented

English | [中文](2026-09-07-css-modules-composes-in-class-map.zh.md)

## Problem

Community plugin and Host Client CSS pipelines compile `.module.css` with lightningcss, then export a class map for `import css from './x.module.css'`. Selected sidebar session rows use `composes: row` on `.rowCurrent` so the highlight class also carries the base row's flex, padding, and status-slot layout. The bundlers kept only `export.name` and dropped `export.composes`, so `css.rowCurrent` applied the highlight colors without the base row layout and the title jumped left on selection.

## Decision

When building the JS class map, join each export's hashed name with every local or global composed name (space-separated), matching lightningcss's documented CSS Modules contract. Cross-file `composes … from` stays unsupported and fails loud: the inline stylesheet plugins do not resolve other CSS files. Shared helper: `scripts/css-module-class-name.ts`; callers are `packages/client/tsdown.client.ts` and the community plugin `tsdown.client.config.ts` files.

## Alternatives considered

**Stop using `composes` and always write `className={\`${css.row} ${css.rowCurrent}\`}`.** Rejected as the primary fix: dozens of composed classes would each need manual dual application, and the next `composes` author would hit the same silent drop.

**Switch the CSS pipeline to a bundler that resolves `composes` automatically.** Rejected: the existing lightningcss-in-tsdown path is shared; fixing the export map restores the intended contract without a second CSS toolchain.

## Consequences

Selected, archived, and other composed rows keep base layout. Authors may keep writing `composes:` for same-file mixins. A new cross-file `composes … from` fails at build until a CSS bundler is added.
