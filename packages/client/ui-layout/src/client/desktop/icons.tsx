/** Inline SVG glyphs for the desktop title bar (no ui-primitives dependency). */

/** Sidebar panel toggle glyph. */
export function PanelIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path fill="currentColor" d="M2 2.5h12a.5.5 0 0 1 .5.5v10a.5.5 0 0 1-.5.5H2a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5zm.5 1v9h3v-9h-3zm4 0v9h7.5v-9H6.5z" />
    </svg>
  )
}

/** Back chevron. */
export function ChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path fill="currentColor" d="M8.5 2.15 4.33 6.32a1 1 0 0 0 0 1.36L8.5 11.85 9.35 11l-4.17-4.17L9.35 2.65z" />
    </svg>
  )
}

/** Forward chevron. */
export function ChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path fill="currentColor" d="M5.5 2.15 4.65 3l4.17 4.17L4.65 11.35 5.5 12.2l4.17-4.17a1 1 0 0 0 0-1.36z" />
    </svg>
  )
}

/** Window minimize glyph. */
export function MinIcon() {
  return <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><rect y="4.5" width="10" height="1" fill="currentColor" /></svg>
}

/** Window maximize glyph. */
export function MaxIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

/** Window close glyph. */
export function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
  )
}
