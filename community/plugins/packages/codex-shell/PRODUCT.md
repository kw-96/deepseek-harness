# dsh-codex-shell PRODUCT.md

Product truth only. Visual decisions live in DESIGN.md.

## What it is

A DeepSeek Harness web-profile bundle plugin: one integrated Codex-style
workspace shell replacing the native sidebar browser and adding a right-edge
workbench panel over the Web GUI.

## Surfaces and functions

1. **Sidebar browser** (occupies `sidebar.workspaces`, shadows the native
   browser at priority -1):
   - Workspace groups (title, collapse, right-click rename/delete-registration)
   - Session rows: two-line (title + cwd/relative time), status dot
     (running/completed/idle/archived), pin + unread markers, hover-revealed
     kebab menu
   - Session context menu: fork / rename / archive / copy cwd / copy id /
     copy deep link / open in new window
   - Subagent sessions nest under their parent as an expandable tree
   - New-session button; add-workspace via the native directory-flow slot
     (never redeclared); session search
2. **Right-edge panel** (occupies `shell.overlay`, tabbed, closable):
   - Files: directory tree, name search, text preview + save (512KB cap)
   - Git: status/staged/unstaged, diff, stage/unstage/discard (confirmed),
     commit, branches, log
   - Projects: per-workspace additional directories (add/remove/browse),
     persisted under `$DSH_HOME/storages/dsh-codex-shell/dirs.json`
   - Plugins: runtime plugin inventory (enable/disable, protected entries
     locked) + marketplace install list
   - Commands: current session's user prompts, newest first
   - Summary: per-session pinned notes (localStorage)
   - Browser: URL bar + sandboxed iframe
3. **Header utility** (`conversation.session.header.utilities`): toggles the
   right panel.

## Constraints

- Style only through CSS Modules and `--cx-*` custom properties with `--dsw-*`
  fallbacks; never touch host globals or host shell.
- Never redeclare `sidebar.workspaces.directoryFlow` (the native owner keeps
  the declaration alive under shadowing).
- Host data only through the `codexShell` Typert Remote (fs/git/project dirs);
  plugin-manager and marketplace remotes are optional, probed at render time.
- Platform: web desktop, dark. The panel is a floating overlay by design so
  the native `details` column and tool details stay available.
