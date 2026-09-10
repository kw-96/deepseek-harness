# dsh-codex-shell PRODUCT.md

Product truth only. Visual decisions live in DESIGN.md.

## What it is

A DeepSeek Harness web-profile bundle plugin: one integrated workspace shell
replacing the native sidebar browser and driving the host's bottom row with a
multi-tab terminal. The right-hand `details` column is intentionally left to
the host's native panel; the plugin registers no occupant there.

## Surfaces and functions

1. **Sidebar browser** (occupies `sidebar.workspaces`, shadows the native
   browser at priority -1, Codex-style quiet layout on host tokens):
   - Persistent rounded search box
   - Sessions are grouped by workspace first, then ordered most-recently-used
     first within each group (ungrouped/archived also by recency)
   - Workspace label rows: leading folder icon (open when expanded, closed
     when collapsed), tiny 11px label, click to collapse, hover reveals `...`
     menu (new session here / rename / delete)
   - Session rows: fixed 32px height, single line (title only, ellipsized),
     running-dot when active, pin + unread as small persistent markers, and a
     `...` menu revealed on hover
   - Workspace and session names truncate with an ellipsis
   - Session menu: fork / rename / archive / copy cwd / copy deep link /
     open in new window
   - Collapsed rail keeps one 36px search control; the collapse/expand control
     lives in the sidebar header on the web and disappears in the desktop
     shell (the title bar owns it there)
2. **Add-workspace action** (`sidebar.footer.action`, root scope): centered
   directory-picker dialog over the `codexShell.fsList` remote; it never
   touches the native directory-flow slot (whose declaration stays owned by
   the shadowed native browser)
3. **Bottom terminal panel** (occupies `bottom` at priority -1): multi-tab
   interactive terminal (`pwsh`/`bash` spawn, Agent `terminal_*` sessions
   followed, `@xterm/xterm` rendering); column height and drag behavior come
   from the host layout
4. **Header utility** (`conversation.session.header.utilities`): on the web it
   renders the bottom-terminal button; the desktop shell renders nothing here,
   because the window title bar carries that button beside the window controls.
   The right-hand panel belongs to the host's official right sidebar
   (`ui-sidebar-right`): its own conversation-header corner button toggles it on
   the web, and the desktop title bar's right-panel button drives the same
   sidebar through `ctx.sidebarRight.toggleExpanded()`. The plugin renders no
   right-panel toggle of its own.

## Constraints

- Style only through CSS Modules and `--cx-*` custom properties mapped onto
  `--dsw-*` host theme tokens (light/dark); never touch host globals or host
  shell DOM.
- Never redeclare `sidebar.workspaces.directoryFlow` (the native owner keeps
  the declaration alive under shadowing). Never declare `details` or
  `conversation.details.tool`: the native panel and its tool seat stay with
  the host, so tool cards keep rendering there.
- Host data only through the `codexShell` Typert Remote (terminal, workspace
  picker, project registry). Subsystems that lost their surface with the right
  panel — file read/write/search, git, and the plugin's own project-directory
  store — are removed from this plugin; the Git timeline ships separately as
  `dsh-git-timeline`.
- Platform: web desktop, light and dark themes.
