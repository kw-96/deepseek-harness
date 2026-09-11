---
description: "Experimental Tauri desktop shell that opens DeepSeek Harness Web in an independent native window."
kind: "package-reference"
---

# `@deepseek-ai/dsh-experimental-web-desktop`

English | [中文](README.zh.md)

## Summary

A private Windows-first Tauri shell that opens `dsh web` in its own native window: it spawns the CLI without a console, shows a splash until the authenticated `dsh web: http://…` line arrives, then navigates WebView2 there. It also watches the harness, restarting an exited one so the window reconnects, and gives up after three consecutive startup failures with the real cause instead of a timeout. The repository tracks root `DeepSeek Harness.exe`. The shell never mounts Cordis; the Node application still starts only through the `dsh` CLI and the `web` profile ([application launch](../../../docs/architecture.md#application-launch)).

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

### Startup watch and rebuilds

A harness that exits before printing its ready line closes the wait with its exit status and the tail of its output, so the splash names the real cause — for example another `dsh web` holding the port — instead of a bare timeout. Three consecutive startup failures give up with the same diagnostic instead of looping.

Each launch runs `pnpm install` when `node_modules` is missing or older than `pnpm-lock.yaml`, and `pnpm run build:web` only when the frontend is stale: no `apps/web/dist/index.html`, or a build input newer than it (`apps/web/{src,public,index.html,vite.config.ts,tsconfig.json,package.json}`, `pnpm-lock.yaml`, and every `packages/*/*/lib`). Community plugin bundles arrive at runtime and are deliberately excluded, which keeps source HMR from forcing a frontend rebuild. `DSH_DESKTOP_SKIP_INSTALL` and `DSH_DESKTOP_SKIP_WEB_BUILD` skip both steps; the shell then snapshots `apps/web/dist` (`DSH_WEB_DIST_INDEX`) so an open session ignores later rebuilds.

-----

<a id="dev-note"></a>
## Dev Note

Decision record: [experimental web desktop shell](../../../.agents/notes/implemented/feature/2026-09-07-experimental-web-desktop-shell.md); [Codex-style desktop title bar](../../../.agents/notes/implemented/feature/2026-09-07-codex-style-desktop-titlebar.md).

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
- **Custom title bar needs Tauri IPC** — with system decorations off, the splash and Web title bar call minimize / maximize / close through `withGlobalTauri` and the remote capability; the same Web UI in a normal browser does not show that chrome.
- **Frontend freeze is dist-only** — Host still launches through checkout `dsh` (source); only the Web asset tree is rebuilt and snapshotted for the session.
- **A restarted backend does not reload the window** — the shell navigates once, so recovery depends on the Web client's own reconnect loop; if that loop ever stopped retrying, the window would keep the notice until it is reloaded or relaunched.
