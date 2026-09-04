# dsh-codex-shell DESIGN.md

Replacement visual world, v3: **Native Workbench**. A quiet, dense engineering
console that matches the DeepSeek Harness dark host and reads as Codex: layered
neutral darks, hairline geometry, one Codex-blue signal, and a vertical
activity rail for the right-edge panel. Operate mode — familiarity over
expression.

## Color tokens

Defined once on `.root` and `.panel` so the sidebar and the overlay share one
palette. The host supplies fonts, elevation, and motion tokens; the palette is
self-contained so it survives outside the host theme.

| Token | Value | Use |
|---|---|---|
| `--cx-bg` | #181818 | canvas (sidebar root, panel rail) |
| `--cx-bg-surface` | #1e1f22 | panel surface |
| `--cx-bg-raised` | #232528 | menus, popovers |
| `--cx-bg-inset` | #1b1d1f | inputs, code wells, cards |
| `--cx-text-hi` | #ffffff | primary text |
| `--cx-text-mid` | #c6cbd2 | row text, secondary |
| `--cx-text-low` | #878d96 | sublines, meta, placeholders |
| `--cx-line` | rgba(255,255,255,.09) | hairline borders |
| `--cx-line-strong` | rgba(255,255,255,.16) | focus-adjacent, hover borders |
| `--cx-accent` | #339cff | current row, primary actions, focus, running |
| `--cx-accent-strong` | #5fb3ff | accent hover |
| `--cx-accent-muted` | rgba(51,156,255,.14) | current tint, accent washes |
| `--cx-hover` | rgba(255,255,255,.06) | hover fills |
| `--cx-active` | rgba(255,255,255,.1) | pressed fills |
| `--cx-success` | #40c977 | staged, completed |
| `--cx-error` | #fa423e | destructive, errors |
| `--cx-warn` | #d9a441 | warnings |
| `--cx-skill` | #ad7bf9 | reserved skill accents |

No orange anywhere. The blue accent is the only saturated signal; green and
red are reserved for Git and state semantics.

## Typography

One system sans family (`var(--dsw-font-family)`) for everything; mono is
reserved for code, hashes, and measurements.

- Group labels: 11px / 600
- Session title: 12.5px / 500; subline 11px / low
- Subagent rows: 12px / low, indent 16px + left connector
- Panel title: 13px / 600
- Panel body: 12.5px / 1.45; code 12px mono / 1.6
- Tabular figures on counts, times, hashes, sizes

## Shape, space, elevation

- Radii: 8px controls · 10px inputs · 12px menus · 14px panel
- 4px grid; groups get more space above than below their heading
- Shadows come from the host `--dsw-elevation-prominent` (soft, offset)
- Current row: accent-muted fill + strong hairline border, no left rail
- Focus-visible: 2px accent ring, offset 2, on every control

## Right panel structure

A vertical activity rail (44px, icons only, tooltips + aria-labels) replaces
the old horizontal label tabs; a single title header names the active tab; the
close action pins to the rail bottom. The workbench body holds the active
panel. The panel floats as a rounded card inset from the right and bottom
edges.

## Motion

140ms host ease for state transitions; 180ms host ease-out for the panel slide;
1.6s running pulse. Motion conveys state only. Reduced-motion disables all
animation and transitions.

## States

default / hover / active / focus-visible / disabled / loading / error / empty.
Empty states teach the next action; loading uses quiet skeletons or one shared
spinner.

## Rules

- Never redeclare `sidebar.workspaces.directoryFlow`.
- CSS Modules + `--cx-*` only; host globals untouched.
- Icons from one library (lucide), one visual weight.
- No orange or amber accent; blue only as the signal color.
