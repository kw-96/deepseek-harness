# Agent Note: Desktop shell hides to a tray icon instead of quitting

Status: implemented

English | [中文](2026-09-16-desktop-tray-hide-and-workspace-menu.zh.md)

## Problem

Close meant quit. The title-bar close button, `Ctrl+W`, and `Alt+F4` all reached the shell's `CloseRequested` handler, which tore down `dsh web` and exited the process. A desktop user who only wanted the window out of the way lost the running harness with it — no way to keep a session reachable, no way back except relaunching, and no entry point into a workspace that does not go through the window first.

## Decision

The main window no longer ends the process. The shell installs a tray icon at startup (`src-tauri/src/tray.rs`), answers `WindowEvent::CloseRequested` with `api.prevent_close()` plus `Window::hide`, and leaves `dsh web` serving in the background; left-clicking the icon restores and focuses the window. Quit is explicit: the tray's Quit row or File → Quit (`Ctrl+Q`) invokes the `quit_desktop_app` command, which ends the `dsh` process tree and exits.

The tray menu carries the workspaces. `ui-layout`'s apply world subscribes to the workspace list through `ctx.inject(['workspaces'])`, pushes `{id, title}` rows plus localized labels with the `set_desktop_tray` command, and rebuilds the menu on every workspace or language change. Selecting a workspace row shows the window and emits `tray-open-workspace`; the page turns that into `uiWorkspace.openWorkspace(id)`, so the click lands in that workspace's session. Menu copy comes from the client locale dictionaries (`desktop.tray.*`, `desktop.menu.quit`); the shell keeps Chinese fallbacks only for the window between process start and page load.

## Alternatives considered

**A tray owned by the Web frontend.** Rejected: the tray must exist before the WebView reaches the harness URL — the splash page is closable to the tray too — and the shell stays the single owner of window and process lifetime.

**Rust reading the workspace registry itself.** Rejected: workspaces are Host business data behind the client service, including ordering and archive rules; the shell would fork that model in Rust for a menu.

**A native context menu on the title-bar close button.** Rejected: not requested, and the tray row is the requested entry point.

**Single-instance enforcement.** Rejected for this cut: launching the exe twice still starts a second shell and therefore a second tray icon, and nothing here needs cross-process coordination.

## Consequences

Closing the window keeps the port and the running session alive; only Quit releases them, and `scripts/smoke-tray-hide.ps1` asserts exactly that split (window hidden, exe alive, ports still serving, then a script-driven tree kill). A harness that exits on its own still restarts under the possibly hidden window, so the tray icon is the only remaining signal that the backend is alive.
