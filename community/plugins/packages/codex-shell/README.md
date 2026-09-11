# dsh-codex-shell

English | [中文](README.zh.md)

A Codex-workflow-styled integrated workspace shell for DeepSeek Harness (DSH): the workspace/session sidebar, per-workspace project directories, and a multi-tab bottom terminal in **one bundle plugin**. The right-hand panel belongs to the host's native `details` column; this plugin no longer occupies it.

## Features

- **Sidebar browser** (shadows `sidebar.workspaces`, follows the Codex left-rail arrangement, and hides the top brand row with the DeepSeek icon and wordmark): search requests are debounced and cancelled so that only the newest result is shown; result rows and session/project tree rows support keyboard open and collapse; session rows do not show the update time, titles normally fill the available width and are elided only when they overflow the container, and pin/archive/more actions appear only on hover or on the selected row; menus close on outside click or Esc and stay inside the viewport; the sidebar collapse/expand control sits at the top on Web (wide state: a collapse button above the new-session button; rail state: an always-visible open icon) and is not shown in the standalone desktop window (the title bar owns it); the far right of the "Projects" title bar is **New project** (the dialog picks a name plus the base workspace; a directory can also be selected directly, and that directory first creates or reuses a workspace and then becomes its first worktree), while "Add workspace..." stays in the organize menu; the project list always sorts as **pinned > most recent activity > fallback** (most recent activity is the newest update time among the project's sessions); hovering a project row pins or unpins it, to the right of the pin button is "New session in project" (starts a session in the project's first owning workspace, hidden when there is no owning workspace), and the "..." menu to its right offers rename project / manage worktrees (add or remove project roots) / archive group sessions / delete project; a project row whose group holds a running session lights the same running dot next to the project name, so ongoing work stays visible even while the project is collapsed, and it steps aside while the row reveals its three action buttons on hover or keyboard focus; the "More > Project" entry of a session lists exactly those projects, and on attach a session directory that hits one of the project's workspaces lands in that workspace and otherwise lands in the project's base workspace, while a project with no workspace yet gets one created from its session directory and taken into the project; sessions offer pin/archive/more actions (subagent information is presented by the session header directory, and the sidebar no longer nests subagent rows).
- **Add workspace** (organize menu; the desktop title bar's File > Open Workspace uses the same path): a centered directory picker dialog (path input + directory browsing + create, backed by `codexShell.fsList`) that does not reuse the native directoryFlow slot; the sidebar footer no longer shows an add-workspace button.
- **Archiving and auto-archive**: a single archive from the session menu; the "Organize" menu sets the auto-archive threshold (off / 7 / 14 / 30 / 90 days without activity, 30 days by default, written to the sidebar preference store), and while the sidebar is open it scans once every 30 minutes, skipping running, currently selected, blank placeholder, and subagent sessions; archived sessions are collected into the sidebar's "Archived" bucket, and hovering a row offers "Restore" (the host's `unarchiveSession`, which keeps the original workspace position unchanged).
- **Project picker on the new-session page** (shadows `conversation.hero.workspace`): the workspace chip of the empty-session hero now selects a **project**; it lists projects (pinned > recent) + ungrouped workspaces + "New project..."; a project with several workspaces expands its worktrees first so that the user picks one, a single-workspace project starts the session directly, and a project with no owning workspace is disabled with the reason shown.
- **Bottom interactive terminal**: a self-contained multi-tab terminal in the host's `bottom` row (new tabs create `pwsh`/`bash`, agent `terminal_*` sessions can be followed, rendered with `@xterm/xterm`) that runs in parallel with the model-side line-mode tools; column widths, dragging, and animation are owned by the host layout.
- **Session header utility button** (`conversation.session.header.utilities`): renders the bottom terminal button on Web, and is not rendered in the standalone desktop window (the top bar provides that button to the left of the window controls). The right-hand panel belongs to the host's official right sidebar (`ui-sidebar-right`): on Web it is toggled by the session-header corner button that the right sidebar itself provides, and in the standalone desktop window by the top bar's "Toggle right panel" button.
- **Visuals**: maps the host's `--dsw-*` theme tokens completely and follows light and dark themes automatically; the sidebar uses a minimal Codex-style arrangement (quiet grouping, single-line sessions, actions revealed on hover).

## Install

```sh
dsh plugin --profile web add file:/path/to/community/plugins/tarballs/dsh-codex-shell-0.6.5.tgz
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

Restart the profile after installing (`dsh web`). Use the host's "Settings > Plugins" page to view and configure plugins, MCP servers, and skills (it requires host-side capabilities such as `dsh-plugin-manager`); this plugin no longer provides its own panel.

## Host Remote

`ctx.remote.codexShell` (Typert):

- `terminalOpen/terminalList/terminalFollow/terminalWrite/terminalResize/terminalClose` (bottom-bar multi-tab; `terminalSend`/`terminalRead` are still available)
- `fsList` (directory browsing for the add-workspace dialog)
- `projectList/projectCreate/projectRename/projectSetRoots/projectDelete` (sidebar project layer, going through the host workspaceRegistry)

Directory listing goes through `ctx.fs`. Git capabilities (commit history, change list) have moved out of this plugin: see the separate [`dsh-git-timeline`](../git-timeline/README.md) right-sidebar tab plugin.

## Known Limitations and Deferred Work

- Moving a project across directories requires changing the session cwd (deferred for this release); attaching a session to a matching workspace in the same directory (`attachSession`) and "move to ungrouped" (`detachSession`) are complete. Permanent worktrees / a Cursor opener still await the host.
- The right-hand panel belongs to the host's official right sidebar (`ui-sidebar-right`: the file / guide / document-preview tabs depend on the installed right-sidebar tab packages); this plugin no longer provides the file tree / Git / command history / summary / embedded browser panels. The Git timeline lives in the `dsh-git-timeline` plugin.
- Extra directories register paths only and do not take over sandbox permissions (they do not replace `fs-sandbox`).
- The add-workspace picker ships with the plugin (directory browsing + path input) and does not reuse the native directoryFlow flow.
