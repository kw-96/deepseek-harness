---
description: "Experimental Tauri desktop shell that opens DeepSeek Harness Web in an independent native window."
kind: "package-reference"
---

# `@deepseek-ai/dsh-experimental-web-desktop`

English | [中文](README.zh.md)

## Summary

A private Windows-first Tauri shell that opens `dsh web` in its own native window: it spawns the CLI without a console, shows a splash until the authenticated `dsh web: http://…` line arrives, then navigates WebView2 there. It also watches the harness, restarting an exited one so the window reconnects, and gives up after three consecutive startup failures with the real cause instead of a timeout. The repository tracks root `DeepSeek Harness.exe`. The shell never mounts Cordis; the Node application still starts only through the `dsh` CLI and the `web` profile ([application launch](../../../docs/architecture.md#application-launch)). The close button hides to the tray.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Use this package](#use-this-package)
- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="prerequisites"></a>
## Prerequisites

- **Peer hosts (run only):** Windows with WebView2 Runtime, a checkout that includes root `dsh.cmd`, tracked `.runtime/node-v24*`, `DeepSeek Harness.exe`, and the built Web artifacts under `apps/web/dist`
- **Maintainers (rebuild the shell):** Rust stable + Windows MSVC linker

-----

<a id="use-this-package"></a>
## Use this package

**On any Windows checkout after `git clone` / `git pull`:** double-click repository-root `DeepSeek Harness.exe`. Extra CLI arguments after the exe are forwarded to `dsh web` after `--no-open`. They do not override an explicit `webserver` row in the profile: this machine's web profile pins `port` to 3080, so `--port` does not move the listener (measured: it still fails on 3080 being in use).

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

CLI resolution order: `DSH_DESKTOP_CLI` → walk upward from this exe → walk from the process cwd → walk from the compile-time crate path → bare `dsh.cmd` / `dsh` on `PATH`. When a checkout CLI is found, that directory is the spawn working directory.

### Startup watch

A harness that exits before printing its ready line closes the wait with its exit status and the tail of its output, so the splash names the real cause — for example another `dsh web` holding the port — instead of a bare timeout. Three consecutive startup failures give up with the same diagnostic instead of looping.

The shell never installs dependencies or builds the frontend: it spawns `dsh web --no-open` and navigates to the authenticated URL, and that server serves the already-built `apps/web/dist`. Build the artifacts first (`pnpm run build`, or `pnpm run build:web` for the frontend alone) and have the profile installed (`node community/seed.mjs`); when either is missing, the shell reports the server's own failure instead of repairing it.

### Tray

The shell installs a tray icon at startup: the title-bar close button, `Ctrl+W`, and `Alt+F4` only hide the window, so `dsh web` keeps serving in the background, and left-clicking the icon restores and focuses the window. The right-click menu lists the current workspaces (pushed by the Web side through `set_desktop_tray`, in the same order as the sidebar), plus Show Window and Quit — selecting a workspace shows the window and opens that workspace's session, while Quit (or File → Quit, `Ctrl+Q`) ends the `dsh` process tree and exits the shell.

Tray copy comes from the Web side's locale dictionaries (`desktop.tray.*`, `desktop.menu.quit`); before the page loads, the shell shows built-in Chinese fallbacks.

The shell is **single-instance**: launching `DeepSeek Harness.exe` again neither starts a second shell nor a second tray icon — it restores the existing window (the guard's identity is the `tauri.conf.json` identifier, and the second process exits before it would spawn its own `dsh web`).

The hide behavior is assertable with `scripts/smoke-tray-hide.ps1` (3080 by default, `-Port` picks a free one; the script judges only the process tree it started, so another dsh instance on the same machine cannot confuse it, and it cleans up before exiting):

```powershell
powershell -ExecutionPolicy Bypass -File packages/experimental/web-desktop/scripts/smoke-tray-hide.ps1 -Port 3199
```

It asserts the single-instance guard (a second launch exits at once and reveals the running window), that closing the window hides it while the process stays alive (which also proves the tray was installed — without one the shell falls back to closing the app), and, in the real mode, that `dsh web` keeps serving. Add `-FakeCli` to check the shell alone: the script fabricates a backend, so it takes no port and touches no profile, which makes it runnable while another dsh instance is already serving.

```powershell
powershell -ExecutionPolicy Bypass -File packages/experimental/web-desktop/scripts/smoke-tray-hide.ps1 -FakeCli -Port 3199
```

-----

<a id="dev-note"></a>
## Dev Note

Decision record: [experimental web desktop shell](../../../.agents/notes/implemented/feature/2026-09-07-experimental-web-desktop-shell.md); [Codex-style desktop title bar](../../../.agents/notes/implemented/feature/2026-09-07-codex-style-desktop-titlebar.md); [desktop tray hide and workspace menu](../../../.agents/notes/implemented/feature/2026-09-16-desktop-tray-hide-and-workspace-menu.md).

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
- **CI does not gate `tauri build`** — local or optional jobs own the native compile until a Rust/WebView2 runner is allocated.
- **Committed exe can go stale** — changing shell sources without re-running `pnpm run desktop:web` and committing the new `DeepSeek Harness.exe` leaves peers on an old binary.
- **No theme-switching .exe file icon** — Windows Explorer does not recolor PE icons from system light/dark mode; the shipped icon uses a dark tile and white mark so both themes stay readable.
- **Custom title bar needs Tauri IPC** — with system decorations off, the splash and Web title bar call minimize / maximize / close through `withGlobalTauri` and the remote capability; the same Web UI in a normal browser does not show that chrome.
- **Closing the window does not release the port** — closing only hides to the tray; ending the backend and freeing the port requires Quit from the tray menu or File → Quit.
- **A restarted backend does not reload the window** — the shell navigates once, so recovery depends on the Web client's own reconnect loop; if that loop ever stopped retrying, the window would keep the notice until it is reloaded or relaunched.
