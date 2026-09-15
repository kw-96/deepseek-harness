# dsh-codex-shell

English | [中文](README.zh.md)

Multi-tab interactive bottom terminal for DeepSeek Harness (DSH), in **one bundle plugin**: a self-contained `pwsh`/`bash` terminal in the host's bottom row that also follows Agent `terminal_*` sessions. The Codex-styled left navigation rail (session browser, projects, add-workspace dialog, new-session project picker) ships separately as [`dsh-workspace-rail`](../codex-left/README.md); the two plugins compose and can also be installed alone.

## Features

- **Bottom interactive terminal** (occupies the host `bottom` row at priority -1): a self-contained multi-tab terminal that runs in parallel with the model-side line-mode tools — new tabs create `pwsh`/`bash`, Agent `terminal_*` sessions can be followed, and rendering uses `@xterm/xterm`. Non-active tabs keep following their PTY and only hide their DOM. Column height, dragging, and animation are owned by the host layout; the close button writes back to `ctx.layout.closeBottom`.
- **Session header utility button** (`conversation.session.header.utilities`): renders the bottom-terminal button on Web, and renders nothing in the standalone desktop window (the top bar provides that button to the left of the window controls).
- **Visuals**: maps the host's `--dsw-*` theme tokens through the same `--cx-*` aliases `dsh-workspace-rail` uses, and follows light and dark themes automatically.

The right-hand panel is not part of this plugin: it belongs to the host's official right sidebar (`ui-sidebar-right`), toggled by the session-header corner button on Web and by the top bar's right-panel button in the desktop window.

## Composing with dsh-workspace-rail

`dsh-workspace-rail`'s session menu calls `terminalOpen` on this plugin's `codexShell` Remote for its "Open in terminal" entry. The service name and the `terminalOpen(sessionId, options)` signature are the cross-plugin interface: rename either only together with the consumer. This plugin depends on nothing from `dsh-workspace-rail`.

## Install

```sh
dsh plugin --profile web add file:/path/to/community/plugins/tarballs/dsh-codex-shell-0.7.0.tgz
dsh plugin --profile web remove dsh-codex-shell
```

## Develop (source link + hot reload)

Keep `dsh web` (or the desktop shell) running, then run:

```sh
node community/plugins/dev.mjs codex-shell
```

The script mounts the plugin into the web profile as a source link, enables Cordis HMR in `cordis.patch.yml` and points it at the source directory, then starts the dual host/client watch build. Afterwards, edit the source: the host side is hot-swapped by Cordis HMR and the client side pushes browser hot reloads through `client-hmr`, with no server restart and no manual page refresh.

Or insert it manually in the profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: codex-shell
      name: dsh-codex-shell
```

Restart the profile after installing (`dsh web`). Use the host's "Settings > Plugins" page to view and configure plugins, MCP servers, and skills (it requires host-side capabilities such as `dsh-plugin-manager`).

## Host Remote

`ctx.remote.codexShell` (Typert):

- `terminalOpen/terminalList/terminalFollow/terminalWrite/terminalResize/terminalRead/terminalClose` (the bottom-bar multi-tab terminal; `terminalFollow` is a stream)
- `terminalSend` (line-mode send, available to non-panel consumers)

Terminal PTY sessions are owned by the live Agent of the requested session (`ctx.terminals`, scoped through `ctx.agents`).

## Known Limitations and Deferred Work

- The bottom terminal needs the host's terminal capability (`@deepseek-ai/dsh-terminal` plus a provider such as `terminal-bash`) mounted in the profile; without it the plugin cannot activate.
- The terminal is bound to the current session's live Agent: with no live Agent the panel shows "The terminal needs a live Agent for the current session." rather than spawning a detached shell.
- `terminalSend`/`terminalRead` exist for non-panel consumers; the panel itself uses the streaming path.
