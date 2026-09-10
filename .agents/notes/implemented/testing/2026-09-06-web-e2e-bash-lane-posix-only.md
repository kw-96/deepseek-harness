# Agent Note: The Web e2e bash scenarios are POSIX-only

Status: implemented

English | [中文](2026-09-06-web-e2e-bash-lane-posix-only.zh.md)

## Problem

The assembled Web e2e lane (`pnpm run test:web`) failed wholesale on a Windows developer machine: suites driving or replaying `bash` tool calls failed with `unknown tool "bash"`, the shipped-composition catalog assertion expected `bash` where the Windows composition registers `pwsh`, and the plugin-config section asserted a terminal timeout default that differs per platform. The failures looked like regressions but were the lane's platform assumption surfacing: the presets mount `dsh-tool-bash` only on POSIX (`disabled: !!js process.platform === 'win32'`) and `dsh-tool-pwsh` only on Windows, because the base bundle mounts `bash-sandbox` as `ctx.shell` on POSIX and `pwsh-sandbox` on Windows. A Windows refresh pass also re-recorded session fixtures with Windows temporary paths, which the replay comparison then rejected on the next run.

## Decision

The bash-dependent Web e2e suites are declared POSIX-only in the tests themselves. Each suite that drives or replays the `bash` tool — `shipped-composition` (catalog and background-job producer cases), `minimal-preset`, `ptc-round`, `replay-round-trip`, `turn-tail-actions`, `approval-composer`, and `chat-continuous-conversation` — skips on Windows with `describe.skipIf(process.platform === 'win32')` (per-case `it.skipIf` where only part of a file depends on bash), with a comment naming the preset platform split as the reason. `plugin-config` stops hard-coding the POSIX timeout default: the composed terminal default is `60000` under `bash-sandbox` and `120000` under the Windows `pwsh-sandbox` (which inherits `pwsh-local`'s default), selected by `process.platform`. The Linux CI lane is unchanged: the skips are Windows-only, and the fixtures keep their Linux-recorded content. A Windows refresh pass recorded polluted session fixtures; that commit was reverted so the fixtures remain Linux-authored (re-recordings belong to the macOS/Linux lane the testing policy owns).

## Alternatives considered

### Fix the tests to run bash on Windows

The presets deliberately substitute `pwsh` for `bash` on Windows; making the lane compose bash there would test a composition no shipped Windows deployment runs, and would require re-recording every fixture against an artificial composition. Rejected.

### Re-record fixtures on Windows and normalize Windows paths

Recording on Windows bakes Windows temporary paths and the pwsh catalog into fixtures the Linux lane compares literally; normalization would hide real drift and invert the policy that fixtures replay on macOS/Linux. Rejected; the polluted re-record commit was reverted instead.

## Consequences

- Windows local runs of `test:web` no longer fail on scenarios the platform cannot exercise; the skipped suites report as skipped with the platform split named in the comment.
- The `preview-boot` packed-worker scenario remains the one Windows failure with no platform gate: its 240-second boot budget is exceeded by a slow local boot, and it stays a Linux-owned timing budget.
- The paperclip-button UI goldens still need a macOS/Linux re-record; the Windows re-record was reverted with them, so that refresh belongs to the CI lane or a POSIX machine.
