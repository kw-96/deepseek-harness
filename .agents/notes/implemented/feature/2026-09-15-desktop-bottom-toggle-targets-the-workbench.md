# Agent Note: Desktop bottom-panel button targets the composed workbench

Status: implemented

English | [中文](2026-09-15-desktop-bottom-toggle-targets-the-workbench.zh.md)

## Problem

The desktop title bar's bottom-panel button toggled the frame's own `bottom` track, and that track has no occupant in the shipped Web composition: the session's lower area belongs to an external bottom workbench (`dsh-better-sidebar`), opened from a control that plugin registers in the session header. The two controls therefore did different things — the header toggle opened the workbench, and the title-bar button opened an empty track.

## Decision

The button asks the composition first. `ui-layout`'s injected `toggleBottom` reports whether it handled the click: it looks for an occupant-registered `[data-dsh-bottom-toggle]` control and clicks it when present, otherwise it returns unhandled and `AppFrame` opens or closes the local `bottom` track. The right-panel button already followed this composition-first rule through `sidebarRight.toggleExpanded`; the bottom button now matches it, and the View menu's Ctrl+J item goes through the same callback.

## Alternatives considered

**Read the workbench service (`ctx.get('betterSidebar')`).** Rejected: that service exposes tab and file-viewer registration plus tab opening, not the workbench toggle, and the shell package must not depend on a third-party plugin package.

**Define a Cordis service contract for bottom workbenches.** Rejected for now: one occupant exists, and the shell would invent an interface that neither side currently needs.

**Drop the title-bar button.** Rejected: shell chrome is the only place a desktop user sees the lower area at all, and removing it would leave the workbench reachable only from the session header.

## Consequences

The title-bar button and the session-header toggle now drive the same workbench; with no such occupant the button keeps its previous local-track behavior. The coupling is a DOM attribute of the occupant's control, so removing that attribute makes the button fall back silently, and `ui-layout` keeps no dependency on the occupant package. The header control's own state stays the single source of truth: the shell button neither reads nor renders it.
