# Agent Note: Desktop shell opens external links in the system browser

Status: implemented

English | [中文](2026-09-11-desktop-shell-external-links.zh.md)

## Problem

Clicking an http(s) link inside the desktop shell (Tauri) did nothing. Markdown anchors render with `target="_blank"`, and the shell never handled a new-window request, so Tauri denied it by default; a same-window navigation would have replaced the harness page with the external site. The shell carried no external-link outlet at all — no opener plugin, no navigation hook, no command.

## Decision

The shell owns one outlet, split across the two paths a link can take. Rust gains `external_links`: the `open_external` command takes the URL a new-window click would have opened, and the `dsh-external-links` plugin's navigation hook catches same-window navigations. Both accept only `http`/`https` and hand the URL to the platform's browser launcher (Windows `rundll32 url.dll,FileProtocolHandler`, macOS `open`, Linux `xdg-open`); the navigation hook refuses the navigation even when the launcher fails, so the shell page can never be replaced by an external site. Requests to the bundled UI page (`tauri.localhost`), `127.0.0.1`/`localhost`, and WebView-internal schemes stay inside the WebView.

The client half lives in `ui-layout`'s desktop module: `installExternalLinkHandler` adds one capture-phase click listener, installed by the title bar (which only mounts in Tauri). It prevents the default only for a plain left click without modifier keys on an anchor whose resolved protocol is http(s) and whose host differs from the page's, then calls the `open_external` command. Browser tabs have no Tauri globals, so the module installs nothing there.

## Alternatives considered

**Add `tauri-plugin-opener`.** Rejected: a new crate dependency and capability wiring for one platform call, when the shell already launches processes and the launcher is three lines per platform.

**Create the main window from `WebviewWindowBuilder` to get `on_navigation`/`on_new_window`.** Rejected: the window currently comes from `tauri.conf.json`, so this would move every window property into Rust code for a hook that only covers one of the two paths — `target="_blank"` never reaches `on_navigation`.

**Keep `target="_blank"` for the browser and strip it in Tauri.** Rejected: it makes the Markdown renderer environment-aware, and the browser half still needs the same click interception for `window.open`-style links.

## Consequences

The shell must be rebuilt for the native half to take effect (`pnpm --filter @deepseek-ai/dsh-experimental-web-desktop build` refreshes the repository-root `DeepSeek Harness.exe`); the client half hot-swaps like any other bundle. Web mode is unchanged. Anchors that already carry a modifier key, are same-origin, or are not http(s) keep native behavior. A link whose launcher fails stays on the page instead of navigating the WebView.

The start page is served by the WebView2 virtual host `tauri.localhost`, which must be recognized as internal: missing it lets the navigation hook block the shell's own start page — the window stays on a blank page (pure black) while `tauri.localhost` is handed to the system browser, where that host does not exist and the page cannot load.
