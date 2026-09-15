# dsh-codex-shell PRODUCT.md

Product truth only. Visual decisions for the shared `--cx-*` token world live in
[`dsh-workspace-rail`'s DESIGN.md](../codex-left/DESIGN.md); the bottom terminal
itself adds no visual language beyond those tokens.

## What it is

A DeepSeek Harness web-profile bundle plugin: the host's bottom row driven by a
multi-tab interactive terminal. The Codex-styled left navigation rail is a
separate plugin (`dsh-workspace-rail`) since 0.7.0; this plugin registers no sidebar
slot at all. The right-hand `details` column is intentionally left to the host's
native panel; the plugin registers no occupant there.

## Surfaces and functions

1. **Bottom terminal panel** (occupies `bottom` at priority -1): multi-tab
   interactive terminal (`pwsh`/`bash` spawn, Agent `terminal_*` sessions
   followed, `@xterm/xterm` rendering); column height, drag behavior, and the
   open/close animation come from the host layout. Non-active tabs keep
   following their PTY and only hide their DOM.
2. **Header utility** (`conversation.session.header.utilities`): on the web it
   renders the bottom-terminal button; the desktop shell renders nothing here,
   because the window title bar carries that button beside the window controls.
   The right-hand panel belongs to the host's official right sidebar
   (`ui-sidebar-right`): its own conversation-header corner button toggles it on
   the web, and the desktop title bar's right-panel button drives the same
   sidebar through `ctx.sidebarRight.toggleExpanded()`. The plugin renders no
   right-panel toggle of its own.

## Cross-plugin interface

The `codexShell` Typert Remote service name and its
`terminalOpen(sessionId, options)` method are the interface
`dsh-workspace-rail`'s "Open in terminal" entry consumes. Renaming the service, the
method, or the option fields requires updating that consumer in the same change.
Nothing in this plugin depends on `dsh-workspace-rail`.

## Constraints

- Style only through CSS Modules and `--cx-*` custom properties mapped onto
  `--dsw-*` host theme tokens (light/dark); never touch host globals or host
  shell DOM.
- Never declare `details` or `conversation.details.tool`: the native panel and
  its tool seat stay with the host, so tool cards keep rendering there.
- Host data only through the `codexShell` Typert Remote (the PTY sessions of the
  live Agent). File access, the project registry, and the session browser moved
  to `dsh-workspace-rail`; the Git timeline ships separately as `dsh-git-timeline`.
- Platform: web desktop, light and dark themes.
