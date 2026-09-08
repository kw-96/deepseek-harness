# Agent Note: Live bundle reload for installed plugins

Status: implemented

[中文](2026-09-08-live-bundle-reload.zh.md) | English

## Problem

`dsh plugin add/remove` installed or removed a bundle (such as `dsh-codex-shell`) by forwarding to pnpm and rewriting `dsh.profile.bundles` in the profile `package.json`. The running service composed bundle patches once at boot, so a live profile still required a restart for the change to take effect.

## Decision

Live profiles re-read the bundle list on every live composition instead of reusing the boot-time snapshot: `composeLive` calls `loadProfile(..., { userLayer: false })` and rebuilds patches from the current `layers`. `watchUserPatches` gains a `load` hook so a watcher can read a non-patch file, and the boot adds a watcher on the profile `package.json`; when `dsh plugin add/remove` rewrites it, the watcher recomposes and `entry.update` diffs the tree, loading new bundle entries and disposing removed ones through the existing Loader/HMR path.

The `cordis.patch.yml` and home patch layers still re-read per generation, and `--patch` overlays remain pinned for the invocation.

## Consequences

`dsh plugin add/remove` now takes effect in running live profiles without a restart. `watchUserPatches` accepts an optional `load` reader; callers that do not pass it keep the default `loadOptionalPatches` behavior.
