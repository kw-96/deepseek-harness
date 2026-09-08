# Agent Note: Codex-style desktop title bar

Status: implemented

English | [中文](2026-09-07-codex-style-desktop-titlebar.zh.md)

## Problem

The experimental Tauri web desktop shell used the default Windows title bar. That strip sat above the Web UI as a second chrome band, so the independent window never read as one surface the way Codex does.

## Decision

The shell window sets `decorations: false` (with `shadow: true` and `withGlobalTauri: true`). Capability ACL grants window minimize / toggle-maximize / start-dragging / close / fullscreen to the main window and to remote `http://127.0.0.1:*` / `http://localhost:*` URLs, because the WebView navigates to the hosted `dsh web` origin.

The splash page carries a thin drag region plus the three window buttons so the undecorated window remains closable before navigation. After navigation, `@deepseek-ai/dsh-client-ui-layout` mounts a Codex-style full-width `DesktopTitleBar` only when Tauri globals are present: leftmost sidebar toggle and session back/forward, then File / Edit / View menus (no Help), a center drag region, and Windows minimize / maximize / close on the right. Menu items wire only to existing DSH actions; Codex-only surfaces (temporary chat, logout, browser submenu, review panel) are omitted rather than stubbed. Cross-plugin actions (new session, settings, add workspace) use the `dsh-desktop:command` window CustomEvent so ui-sidebar, ui-settings-general, and `dsh-codex-shell` can listen without new Cordis edges. Expanded desktop sidebars hide the duplicate collapse control in `logoRow`.

## Alternatives considered

**Floating window buttons only, no menu bar.** Rejected: the requested Codex reference is a full title bar with navigation and File/Edit/View.

**Putting chrome in `dsh-codex-shell`.** Rejected: session and panel plugins must not own OS window controls; AppFrame is the shell frame owner.

**Bundling `@tauri-apps/api` into the Web client.** Rejected: `withGlobalTauri` already exposes the needed window face to both splash and remote localhost pages.

## Consequences

Maintainers rebuild `DeepSeek Harness.exe` after shell changes. Browser `dsh web` is unchanged. Opening a workspace from the File menu requires a `dsh-codex-shell` release that listens for `dsh-desktop:command` (0.6.2+).

Bar sizing, blank-area dismissal, and maximize-state sync are fixed in [2026-09-08-desktop-titlebar-ux-fixes](2026-09-08-desktop-titlebar-ux-fixes.md).
