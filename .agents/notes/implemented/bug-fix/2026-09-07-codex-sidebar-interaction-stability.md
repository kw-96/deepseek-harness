# Agent Note: Codex sidebar interaction stability

Status: implemented

English | [中文](2026-09-07-codex-sidebar-interaction-stability.zh.md)

## Problem

Codex Shell owns a replacement workspace sidebar, so ordinary list interactions cannot rely on the host browser implementation. Its plugin search left prior remote requests active, selected rows revealed a previously unreserved time slot, workspace details opened on pointer hover, and menu dismissal depended on leaving the popover. Those behaviors produced stale search results, title width changes, accidental overlays, and mouse-only recovery paths.

## Decision

The plugin sidebar debounces content requests, aborts the preceding request, and accepts only the newest completion. Session and project rows are focusable tree items: Enter or Space opens/toggles, and session rows use Left/Right for subagent folding. Time and action space remains reserved so selection does not change the title width. Project details open only from an explicit information button. Context menus close on outside pointer input or Escape and clamp their origin to the viewport.

## Alternatives considered

**Keep hover-only details and menu dismissal.** Rejected because pointer travel and accidental hover make workspace navigation unstable.

**Hide the timestamp with `display: none`.** Rejected because changing flex participation changes the title width at selection time.

## Consequences

The Codex Shell sidebar remains compatible with the host session search service while adding plugin-local cancellation and keyboard behavior. The focused plugin tests cover stale-search cancellation and tree-row activation; a real Web run remains the authority for final visual acceptance.
