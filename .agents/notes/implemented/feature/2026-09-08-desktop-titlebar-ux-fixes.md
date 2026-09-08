# Agent Note: Desktop title bar UX fixes

Status: implemented

English | [中文](2026-09-08-desktop-titlebar-ux-fixes.zh.md)

## Problem

The Codex-style desktop title bar shipped with three experience gaps: icons and menu text were too small; an open menu did not collapse when clicking blank title-bar area (only clicks outside the bar closed it); and the maximize button never reflected the window state.

## Decision

- **Larger chrome**: bar height 36→40 px, icon buttons 28→32 px, panel / back / forward glyphs 16/14→18/16 px, window-control glyphs 10→12 px, menu text 13→14 px; window buttons stretch with the bar instead of a fixed height.
- **Blank-area dismissal**: while a menu is open, a `pointerdown` inside the open dropdown or on any menu button keeps or toggles it; a press anywhere else in the bar (including the drag-region blank area) closes it. The drag region closes the menu first and skips `startDragging` while a menu is open, matching Windows convention.
- **Maximize state**: extend the `DesktopAppWindow` face (`isMaximized`, optional `onResized`); read once on mount and re-read after resize events to sync a `maximized` state. The button swaps glyph and `aria-label` between maximize and restore (new locale key `desktop.window.restore`). `getCurrentWindow()` returns a fresh proxy per call, so the component memoizes the face with `useMemo` for effect dependencies.

## Alternatives considered

**Close the menu only on presses outside the bar.** This was the shipped behavior; user feedback ruled it out.

**Flip local state on click without a resize subscription.** Rejected: double-clicking the drag region or external changes would desync the glyph.

## Consequences

The bar is 40 px tall; the window face gains two methods (`onResized` optional, safe on browsers and older shells). A new `desktop-title-bar.client.spec.tsx` covers menu open/close behavior across the bar and maximize-state sync.
