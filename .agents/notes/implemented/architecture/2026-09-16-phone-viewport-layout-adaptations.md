# Agent Note: Phone-viewport layout adaptations

Status: implemented

English | [中文](2026-09-16-phone-viewport-layout-adaptations.zh.md)

## Problem

The Web client carried breakpoints for narrow windows but no layout regime for phone widths, so a 390px viewport rendered desktop geometry squeezed into a phone column. Measured at 390x844 against a running `dsh web`:

- **Frame.** A re-expanded sidebar kept its grid track. `computeColumns` never lets the sidebar concede, so `center = max(0, viewport - sidebar)` put a 280px sidebar beside a 110px center, whose `overflow: hidden` clipped the conversation instead of scrolling it.
- **Settings.** The modal panel kept its 188px navigation rail beside the section content. `max-width: calc(100vw - 48px)` left the section about 155px, and field rows wrapped their labels into vertical single-character columns.
- **Conversation header.** The title row is one non-wrapping flex line. Registrants stack their controls inside the title cluster (mode router, undo, restore, snapshot), which measured 588px inside a 310px row: the seat covered the utility glyphs and clipped its own trailing buttons past the right edge.
- **Wide tables.** Horizontal scrolling for four-column-and-wider tables is enabled by `:hover` on the table container. Touch devices have no hover, so the columns past the right edge were unreachable.

## Decision

Phones (below 768px, the width `ui-sidebar-right` already reads for its fullscreen panel) get their own arrangement of the same components:

**A re-expanded sidebar covers the center instead of taking a track.** `MOBILE_DRAWER_MAX = 768` joins `SIDEBAR_AUTO_COLLAPSE` in `columns.ts`. Below it, AppFrame solves the columns as before, then reports a zero-width sidebar track and renders the column as an absolutely positioned drawer whose width the component computes (`min(84vw, 320px)`) and passes to the sidebar slot, because a covering column has no track to read a width from. A scrim below the drawer dismisses it through the existing `toggleSidebar` action, and the sidebar drag handle is not rendered while the drawer is open — there is no track to resize.

**A touch device also drops the resident rail.** The collapsed sidebar's 56px rail is a permanent column paying rent in width for controls used occasionally; on a phone it took 13% of the viewport in every state. A touch device therefore solves the sidebar track to zero whether the sidebar is collapsed or not: a floating button at the frame's top-left corner brings the same icon column out over the content as a temporary overlay, and a press anywhere inside that column — or on its scrim — parks it again, except the expand control, which swaps the icon column for the full drawer (`toggleSidebar` retires the overlay as part of the same move, so the two never stack). The gate is `navigator.maxTouchPoints > 0`, for the same desktop-mode reason as the composer focus rule below. `SIDEBAR_COLLAPSED` stays the rendered width of the icon column, its one remaining consumer.

**The settings dialog becomes a full-viewport single-column sheet.** The navigation rail turns into a horizontally scrolling strip of the same `navCell` buttons above the section, so the section keeps the full width and no new view state is introduced. The close control grows to a 36px touch target.

**The conversation header becomes a sideways-scrolling strip.** The title row stops wrapping and scrolls horizontally, and each seat keeps its intrinsic width; shrinking them would squash the registered controls back into the column. The crumb cap drops to 160px, the header's horizontal padding to 12px.

**The header corner seat is pinned rather than scrolled.** That seat holds the only control that reopens a collapsed right panel. Inside the strip it landed at the far end of 800-odd pixels of header — `x = 877` on a 390px viewport, off-screen and therefore unreachable by touch — so a phone anchors it to the header's trailing edge and the strip reserves 40px beside it. It also sits above the sidebar drawer's scrim, so the first tap opens the panel instead of being read as a tap outside the drawer.

**Coarse pointers keep wide tables scrollable.** Under `@media (hover: none)` the wide-table container keeps `overflow-x: auto` at rest, because the hover reveal that enables it on pointer devices never fires on touch.

**The composer takes focus only on a keyboard surface.** Its unlock effect returns focus to the draft box on mount and on every session switch — the desktop reading, where the next keystroke should land in the box that was just opened. A phone answers that focus by raising the software keyboard over the conversation the switch was made to show. The gate is a whitelist, not a touch blacklist: the box takes focus only where `(hover: hover) and (pointer: fine)` matches **and** `navigator.maxTouchPoints` is 0. A blacklist on touch readings would fail exactly where it is needed, because a phone browser in desktop mode reports a mouse-like pointer type while `maxTouchPoints` keeps reporting the hardware. Tapping the box still focuses it, and the pointer path is unchanged.

Desktop geometry is untouched: every change is inside a viewport or pointer media query, plus two `maxTouchPoints` readings, and the drawer branch only exists below the phone breakpoint.

## Consequences

A phone viewport now keeps the conversation at full width whether the sidebar is open or closed, and every registered header control stays reachable instead of being clipped. The header is 68px tall on a phone against 76px on desktop, and the settings sheet spends its whole area on one section.

The costs: the sidebar drawer covers content rather than coexisting with it, so a phone user reads the conversation and the session list one at a time; the header strip requires a sideways swipe to reach controls that do not fit, and the first control a user sees depends on where the strip rests, which is its left edge; the drawer breakpoint (768px) is deliberately shared with the right panel's fullscreen reading rather than tuned to any single device class, so a 767px window gets phone behavior and a 768px window does not; and reaching any sidebar control on a touch device costs two taps (button, then the control) where the rail cost one, in exchange for the width that rail held in every state.

## Alternatives considered

**Keep squeezing the center.** This is the current desktop-shaped behavior; at 390px it leaves 110px of conversation and no way to read it, which is what the change removes.

**Split the header into two rows with flex wrapping or grid areas.** The registered controls are children of the title cluster, not siblings of it, so wrapping the row only rearranges its three direct children while the cluster keeps overflowing. Dissolving the cluster with `display: contents` did make the controls grid items of the row, but the seat's content renders through a portal, so the resulting row measured 114px tall against a 28px control height.

**Hide the registered header controls on phones.** The frame cannot tell which of its registrants' controls are optional, and hiding them removes features rather than relocating them.

**Give the settings dialog two-level navigation (list, then detail).** A strip keeps every section one tap away and needs no additional navigation state in the shell.
