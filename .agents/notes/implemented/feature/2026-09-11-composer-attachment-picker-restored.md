# Agent Note: Composer attachment picker restored

Status: implemented

English | [中文](2026-09-11-composer-attachment-picker-restored.zh.md)

## Problem

A local customization had removed the composer's attachment button, leaving paste and drag-drop as the only intake gestures. The upstream 0.1.5 attachment work then named the picker's copy (`file.attach`, "添加附件" / "Add attachment") and extended intake to generic files, so the dictionary key went unused and the composer offered no picker for the files it could now accept. The user asked to restore the native entry point.

## Decision

The toolbar's paperclip button and its hidden `<input type="file" multiple>` return, placed after the commands control — the position the upgraded goldens already carried. The picker takes no `accept` filter because the shipped attachment contract has no file-type whitelist; picked files enter the same `intakeFiles` pipeline as paste and drop, so image batches keep their projected limits and generic files start their background upload on selection. Copy comes from the native `file.attach` key rather than the removed local `input.attachImage`, since the entry now covers images and files alike. The button disables together with drops — locked composer, missing attachment service, or a running subagent — and the input's value is cleared after each pick so the same file can be chosen twice.

## Alternatives considered

**Keep paste and drag-drop only.** Rejected: the upstream entry point exists for a reason, and a picker is the discoverable path once generic files are supported.

**Reuse the old local `input.attachImage` copy.** Rejected: "上传图片" / "Attach image" misnames an entry that also accepts generic files, and the native key already owns the copy.

**Add an `accept` whitelist for common types.** Rejected: the attachment contract stores any file byte-for-byte, so filtering in the picker would contradict the capability.

## Consequences

Snapshot goldens regain an "Add attachment" button row in every composer capture. Component specs cover picking a mixed image-and-file batch, the locked-composer disable, the subagent-running disable beside `canAcceptDrop: false`, and plan/goal turns keeping both gestures enabled. The earlier note that removed the button is archived; paste and drop remain unchanged.
