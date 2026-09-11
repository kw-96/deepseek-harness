# Agent Note: Composer image intake is paste and drag-drop only

Status: implemented
Archived: 2026-09-11

English | [中文](2026-09-08-composer-image-intake-paste-drop.zh.md)

## Problem

The composer's toolbar carried a paperclip button that opened a hidden file picker for image intake. Codex-style intake needs no button: pasting a clipboard image and dropping files onto the composer cover the same gestures. Users also hit a stale loaded client bundle in which a pasted image silently did nothing, which read as "paste is unsupported" even though the built bundle already routed clipboard files into intake.

## Decision

The paperclip button and its hidden `<input type="file">` are removed; image intake is now paste and drag-drop only. Clipboard files were already collected by the composer keymap's `PASTE_COMMAND` handler at CRITICAL priority and forwarded into the same `intakeImages` pipeline the paperclip used, and drops flow through the `conversation.input.attachments` slot, so no intake logic changed. The edit deletes the toolbar entry point, the now-unused `input.attachImage` locale key, and the two component tests that covered the button.

## Alternatives considered

**Keep the button as a third gesture.** Rejected: the user asked for Codex parity, and the picker duplicated paste and drop.

**Keep the hidden input and drop only the visible button.** Rejected: an unlabeled picker reachable only by programmatic click is dead weight once the button is gone.

**Conditionally show the button while the attachment service is absent.** Rejected: `addImages` exists for every session in the shipped web composition; the conditional arm would be unreachable chrome.

## Consequences

The toolbar now holds only the commands control, and snapshot goldens (55 files) drop the Attach-image button row. Paste and drop behavior is unchanged and stays covered by the existing component spec and the `queue-image` / `image-display` e2e scenarios. Users attach images only by pasting them into the composer or dropping them onto the page.
