# Agent Note: Source-linked HMR for community plugins

Status: implemented

English | [中文](2026-09-08-community-plugin-source-hmr.zh.md)

## Problem

Community plugins (`dsh-codex-shell` and friends) install as tarball bundles into a profile's `node_modules`. Cordis HMR's module-reload dependency scan skips `node_modules`, so editing a plugin's source rebuilt a new tarball but could not hot-replace the host-side modules; the client side reloads through `client-hmr`, but the full loop still needed manual steps.

## Decision

`community/plugins/dev.mjs` discovers every community bundle plugin, mounts each into the web profile's `node_modules` from its source directory as a filesystem junction (a symlink off Windows), bypassing pnpm's `link:` resolution, appends an enabled `hmr` row to the profile `cordis.patch.yml` whose `root` points at the plugin sources, then starts each plugin's host/client `tsc --watch` and `tsdown --watch` stages. `profile-boot` spawns this script whenever the script exists while booting the `web` profile, so `dsh web` and the desktop shell start with the loop already running; a released environment without the source tree has no script and skips it. The boot-owned shutdown kills the watch process. With modules resolved through the source mount (not the installed copy), Cordis HMR reloads host modules and `client-hmr` hot-reloads client bundles, so edits apply without a service restart or page refresh.

## Alternatives considered

**Rebuild the tarball and restart on every edit.** Rejected because each change still requires packing, reinstalling the profile, and restarting the service; the host side never hot-replaces and the loop stays manual.

**Widen Cordis HMR's dependency scan to include `node_modules`.** Rejected because skipping `node_modules` is deliberate — it keeps hot-replace limited to source modules and out of installed packages — and relaxing it would blur the released-plugin layout with source paths.

**Watch and copy built `lib/` back into `node_modules` instead of linking.** Rejected because the copy still lives under `node_modules`, so the HMR scan skips it, and a partial copy leaves a half-updated install.

## Consequences

The dev loop runs beside a live `dsh web` / desktop shell. It rewrites the profile's `cordis.patch.yml` (the `hmr` row) and replaces the installed plugin directory under `node_modules` with a junction to the source directory while the `file:` tarball dependency spec stays intact; the installed profile therefore differs from the released tarball layout until the operator removes the junction and reinstalls the tarball.
