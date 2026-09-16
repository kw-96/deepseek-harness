# Agent Note: A right panel with no track opens fullscreen

Status: implemented

English | [中文](2026-09-16-right-panel-trackless-fullscreen.zh.md)

## Problem

Between 768px and 996px of viewport width the right panel's entry button was dead. `AppFrame` solves the columns with a 640px center floor and a sidebar that never concedes, so below `CENTER_MIN + SIDEBAR_COLLAPSED + DETAILS_MIN` (996px) the details track solves to zero and the frame reports `canShow: false`. `SidebarRight` read its own `autoFullscreen` from the viewport (`< 768`) only, so at 800px it opened in `push` mode and then a layout effect closed it again in the same commit (`shown && !fullscreen && !canShow`). Nothing visibly happened, and no state survived to diagnose.

The range matters beyond narrow desktop windows: a phone browser in desktop mode reports a ~980px viewport, which is how the reported device reached it.

## Decision

**A panel that cannot be given a track covers the viewport instead of closing.** `SidebarRight` derives `noTrack = viewportWidth < 768 || !canShow` and takes `fullscreen = noTrack || surface.layout.mode === 'fullscreen'`. The close-on-open layout effect is gone: the condition it guarded is now the condition that selects fullscreen, so it can no longer be true. `track` keeps its previous meaning — `shown && !noTrack` — so a manual fullscreen on a wide viewport still reports the retained track, and the mode button still closes the panel when the user leaves fullscreen where no track exists.

Panel records, tabs, and their signals are untouched by the transition: the panel stays open across a resize into and out of the trackless range, and a mode change made by the user is never rewritten.

## Consequences

Opening the right panel always produces a panel: on a phone in desktop mode, on a narrow desktop window, and on a tablet the entry button now works on the first tap, full-screen rather than not at all. A panel that is already open no longer disappears when the window narrows into the trackless range; it covers the conversation until the window is wide enough to dock it again.

The cost is that a window between 768px and 996px loses the side-by-side reading: the panel covers the conversation instead of sharing the width with it. That is a deliberate trade for "the button works"; the alternative in that range is no panel at all.

## Alternatives considered

**Keep closing the panel and fix only the entry button.** The button cannot open a panel the frame refuses to place, so this leaves the range with no right panel at all.

**Lower `CENTER_MIN` or `DETAILS_MIN` so a narrower track fits.** Both are conversation-readability floors: shrinking them turns "no panel" into "a panel plus a squashed conversation", and the phone-desktop case (980px) would still land under any floor that keeps the conversation readable.

**Enlarge the phone breakpoint to 996px for right-panel fullscreen.** That would couple the panel's presentation to a number the frame derives from three column constants; reading `canShow` keeps the decision in the property that actually matters — whether a track exists.
