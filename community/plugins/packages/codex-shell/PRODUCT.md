# dsh-codex-shell PRODUCT.md

Product truth only. Visual decisions live in DESIGN.md.

## What it is

A DeepSeek Harness web-profile bundle plugin: one integrated workspace shell
replacing the native sidebar browser and docking a right-side workbench into
the product's `details` third column, turning the Web GUI into a persistent
three-column workspace (sidebar | conversation | workbench).

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
     running-dot when active, pin + unread as small persistent markers,
     relative time and `...` menu revealed on hover
   - Workspace and session names truncate with an ellipsis
   - Session menu: fork / rename / archive / copy cwd / copy id / copy deep
     link / open in new window
   - Subagent sessions nest under their parent as an expandable tree
   - Collapsed rail keeps one 36px search control
2. **Add-workspace action** (`sidebar.footer.action`, root scope): footer
   button (wide: labeled row; rail: icon) opening a centered directory-picker
   dialog over the `codexShell.fsList` remote; it never touches the native
   directory-flow slot (whose declaration stays owned by the shadowed native
   browser)
3. **Right workbench panel** (occupies `details` at priority -1; the native
   tool-details panel is shadowed while the plugin is active and restored on
   uninstall):
   - Files: directory tree, name search, text preview + save (512KB cap)
   - Git: status/staged/unstaged, diff, stage/unstage/discard (confirmed),
     commit, branches, log
   - Projects: per-workspace additional directories (add/remove/browse),
     persisted under `$DSH_HOME/storages/dsh-codex-shell/dirs.json`
   - Plugins / MCP / Skills are intentionally not surfaced in the workbench;
     they are viewed and configured through the host's Settings → Plugins
     page instead
   - Commands: current session's user prompts, newest first
   - Summary: per-session pinned notes (localStorage)
   - Browser: URL bar + sandboxed iframe
   - Opens by default on first activation; the conversation-header toggle and
     the rail close button drive the host column through `ctx.layout`
     (`openDetails`/`closeDetails`); session switches re-open the column so
     the three-column layout persists
4. **Header utility** (`conversation.session.header.utilities`): toggles the
   right workbench panel.

## Constraints

- Style only through CSS Modules and `--cx-*` custom properties mapped onto
  `--dsw-*` host theme tokens (light/dark); never touch host globals or host
  shell DOM.
- Never redeclare `sidebar.workspaces.directoryFlow` (the native owner keeps
  the declaration alive under shadowing). Never declare
  `conversation.details.tool` — the shadowed DetailsPanel keeps it, so tool
  cards stay registered and return when the plugin is removed.
- Host data only through the `codexShell` Typert Remote (fs/git/project dirs).
- Platform: web desktop, light and dark themes.
