---
description: "Experimental Tauri desktop shell that opens DeepSeek Harness Web in an independent native window."
kind: "package-library"
---

# `@deepseek-ai/dsh-experimental-web-desktop`

English | [中文](README.zh.md)

## Summary

A private Windows-first Tauri shell that spawns `dsh web --no-open` without a console window, shows a starting splash until the authenticated `dsh web: http://…` line arrives, then navigates WebView2 to that URL. The repository tracks root `DeepSeek Harness.exe`, so another Windows host can `git pull` and double-click it. Each launch may run `pnpm install` (when `node_modules` is missing or older than `pnpm-lock.yaml`) and always runs `pnpm run build:web` via the checkout's `.runtime` Node + corepack (`DSH_DESKTOP_SKIP_INSTALL` / `DSH_DESKTOP_SKIP_WEB_BUILD` to skip), then snapshots `apps/web/dist` (`DSH_WEB_DIST_INDEX`) so the open session ignores later rebuilds. The shell never mounts Cordis itself; the Node application still starts only through the `dsh` CLI and the `web` profile ([application launch](../../../docs/architecture.md#application-launch)).

## Table of Contents

- [Prerequisites](#prerequisites)
- [Use this package](#use-this-package)
- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="prerequisites"></a>
## Prerequisites

- **Peer hosts (run only):** Windows with WebView2 Runtime, a checkout that includes root `dsh.cmd`, tracked `.runtime/node-v24*`, and `DeepSeek Harness.exe`; first launch needs network for `pnpm install` / `build:web`
- **Maintainers (rebuild the shell):** Rust stable + Windows MSVC linker

-----

<a id="use-this-package"></a>
## Use this package

**On any Windows checkout after `git clone` / `git pull`:** double-click repository-root `DeepSeek Harness.exe`. Extra CLI arguments after the exe are forwarded to `dsh web` after `--no-open` (for example `--port 3080`).

**When you change this shell (Rust/UI) before pushing:** rebuild and commit the updated root exe:

```sh
pnpm install
pnpm run desktop:web
git add "DeepSeek Harness.exe"
```

Equivalent filter form: `pnpm --filter @deepseek-ai/dsh-experimental-web-desktop build`.

To refresh the brand icon assets from `apps/web/public/favicon.svg`, install `@resvg/resvg-js` temporarily, run `node scripts/rasterize-brand-icon.mjs`, then `pnpm exec tauri icon src-tauri/icons/icon.png`, and finally `pnpm run desktop:web`. The script emits a **dark rounded tile with a white mark**: Windows `.exe` file icons cannot follow light/dark theme the way the web SVG `prefers-color-scheme` rule does, so a dual-theme-readable solid tile is the workable approach. If Explorer still shows a stale blue glyph for `DeepSeek Harness.exe`, close that folder window or restart Explorer to drop the per-path icon cache.

Development loop (hot rebuild, no root copy):

```sh
pnpm --filter @deepseek-ai/dsh-experimental-web-desktop dev
```

CLI resolution order: `DSH_DESKTOP_CLI` → walk upward from this exe → walk from the process cwd → walk from the compile-time crate path → bare `dsh.cmd` / `dsh` on `PATH`. When a checkout CLI is found, that directory is the spawn working directory. Dependency commands use the bundled `.runtime` Node directory (same tree as `dsh.cmd`).

-----

<a id="dev-note"></a>
## Dev Note

Decision record: [experimental web desktop shell](../../../.agents/notes/implemented/feature/2026-09-07-experimental-web-desktop-shell.md).

-----

<a id="model-experience"></a>
## Model Experience

None, as this package only launches the existing Web profile in a native window and registers nothing model-facing.

#### KV Cache effect

None; the shell neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Windows-first** — Linux and macOS are not a release matrix for this experimental shell; the Tauri tree may build there, but WebView2 packaging and process-tree teardown are validated on Windows.
- **Not an official launcher** — this package stays private and outside official releases; products must keep using `dsh web` or an external host such as CodeMaker Hub.
- **First launch needs network** — `pnpm install` / `build:web` are not offline; later launches skip install when the lockfile is not newer than `node_modules/.modules.yaml`.
- **CI does not gate `tauri build`** — local or optional jobs own the native compile until a Rust/WebView2 runner is allocated.
- **Committed exe can go stale** — changing shell sources without re-running `pnpm run desktop:web` and committing the new `DeepSeek Harness.exe` leaves peers on an old binary.
- **No theme-switching .exe file icon** — Windows Explorer does not recolor PE icons from system light/dark mode; the shipped icon uses a dark tile and white mark so both themes stay readable.
- **Frontend freeze is dist-only** — Host still launches through checkout `dsh` (source); only the Web asset tree is rebuilt and snapshotted for the session.
