# dsh-workspace-rail

English | [中文](README.zh.md)

The Codex-styled left navigation rail for DeepSeek Harness (DSH): the session browser with a durable project tier, the add-workspace dialog, and the new-session project picker, in **one bundle plugin**. The multi-tab bottom terminal ships separately as [`dsh-codex-shell`](../codex-shell/README.md); the two plugins compose and can also be installed alone.

## Features

- **Sidebar browser** (shadows `sidebar.workspaces`, follows the Codex left-rail arrangement): search requests are debounced and cancelled so only the newest result is shown; result rows and session/project tree rows support keyboard open and collapse; session rows do not show the update time, titles normally fill the available width and are elided only when they overflow, and pin/archive/more actions appear only on hover or on the selected row; menus close on outside click or Esc and stay inside the viewport.
- **Sidebar chrome** (occupies `sidebar.brand.name` and `sidebar.brand.mark`): the host brand row (DeepSeek icon and "DSH local build" wordmark) is hidden, the row height is compressed on Web, the rail state renders an always-visible open icon, and the standalone desktop window hides both (its title bar owns the toggle).
- **Projects**: sessions are grouped by project first (project roots are grouped by the longest matching root prefix), the project list always sorts as **pinned > most recent activity > fallback**, hovering a project row pins or unpins it, "New session in project" starts a session in the project's first owning workspace, and the `...` menu offers rename / manage worktrees (add or remove roots) / archive group sessions / delete project. A project row whose group holds a running session lights the same running dot next to the project name.
- **Organize and sort**: the "Organize" menu switches between by-project and flat lists, sets the chat sort (pinned first / recently updated / manual), and sets the auto-archive threshold (off / 7 / 14 / 30 / 90 days without activity, 30 days by default, written to the sidebar preference store). Project, workspace, and archived-bucket collapse state is remembered across reloads.
- **Archiving**: a single archive from the session menu; archived sessions collect into the "Archived" bucket, and hovering a row offers "Restore" (the host's `unarchiveSession`, which keeps the original workspace position). While the sidebar is open it sweeps once every 30 minutes, skipping running, currently selected, blank placeholder, and subagent sessions.
- **Add workspace** (`sidebar.footer.action`): a centered directory picker (path input + directory browsing over `codexLeft.fsList` + create) that does not reuse the native directoryFlow slot; the sidebar footer renders no visible button — the entries are the sidebar header's `+` and the desktop title bar's File > Open Workspace.
- **Project picker on the new-session page** (shadows `conversation.hero.workspace`): the workspace chip of the empty-session hero now selects a **project**; it lists projects (pinned > recent) + ungrouped workspaces + "New project..."; a project with several workspaces expands its worktrees first, a single-workspace project starts the session directly, and a project with no owning workspace is disabled with the reason shown.
- **Visuals**: maps the host's `--dsw-*` theme tokens completely and follows light and dark themes automatically; the sidebar uses a minimal Codex-style arrangement (quiet grouping, single-line sessions, actions revealed on hover). [DESIGN.md](DESIGN.md) owns the visual decisions.

## Composing with dsh-codex-shell

The session menu's "Open with > Open in terminal" entry calls `codexShell.terminalOpen` on the bottom-terminal plugin. That plugin is **optional**: when `dsh-codex-shell` is not mounted the entry is disabled and shows "Requires the bottom terminal plugin (dsh-codex-shell)". Nothing else in this plugin depends on it.

## Install

```sh
dsh plugin --profile web add file:/path/to/community/plugins/tarballs/dsh-workspace-rail-0.1.0.tgz
dsh plugin --profile web remove dsh-workspace-rail
```

## Develop (source link + hot reload)

Keep `dsh web` (or the desktop shell) running, then run:

```sh
node community/plugins/dev.mjs codex-left
```

The script mounts the plugin into the web profile as a source link, enables Cordis HMR in `cordis.patch.yml` and points it at the source directory, then starts the dual host/client watch build. Afterwards, edit the source: the host side is hot-swapped by Cordis HMR and the client side pushes browser hot reloads through `client-hmr`, with no server restart and no manual page refresh.

### Code layout

`src/client/` is split by responsibility: `browser/` holds the sidebar browser (root component, tree, `parts/` rendering pieces, action factories, effects, search chrome), `state/` holds the persisted stores and pure projections, `overlays/` holds the menu flyout and the dialogs, and `index.tsx` / `inject.ts` / `faces.ts` / `locales.ts` stay at the root. Every folder holds at most eight files and every TypeScript file stays within 200 lines.

Or insert it manually in the profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: workspace-rail
      name: dsh-workspace-rail
```

Restart the profile after installing (`dsh web`). Use the host's "Settings > Plugins" page to view and configure plugins, MCP servers, and skills (it requires host-side capabilities such as `dsh-plugin-manager`).

## Host Remote

`ctx.remote.codexLeft` (Typert):

- `fsList` (directory browsing for the add-workspace dialog, the new-project dialog, and worktree management)
- `projectList/projectCreate/projectRename/projectSetRoots/projectDelete` (the project tier, going through the host `workspaceRegistry`)

Sessions, session search, forks, and workspace attach/move/archive come from the host client services (`ctx.sessions`, `ctx.workspaces`); this plugin adds no Remote for them.

## Known Limitations and Deferred Work

- Moving a project across directories requires changing the session cwd (deferred); attaching a session to a matching workspace in the same directory (`attachSession`) and "move to ungrouped" (`detachSession`) are complete.
- Permanent worktrees / a Cursor opener still await the host: the menu entries stay disabled with their reason.
- The "Open in terminal" entry needs `dsh-codex-shell`; without it the entry is disabled.
- The add-workspace picker ships with the plugin (directory browsing + path input) and does not reuse the native directoryFlow flow.
