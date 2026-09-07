# Agent Note: Experimental Web desktop shell

Status: implemented

English | [中文](2026-09-07-experimental-web-desktop-shell.zh.md)

## Problem

Users who want CodeMaker-Hub-style independent-window access to DeepSeek Harness Web still need either the system browser or an external host. The repository had no first-party native window that still obeyed the `dsh` profile application-launch rule, and a gitignored exe could not be double-clicked after a peer `git pull`.

## Decision

`@deepseek-ai/dsh-experimental-web-desktop` is a private Tauri 2 shell under `packages/experimental/web-desktop`. On Windows it builds a binary, copies it to the repository root as tracked `DeepSeek Harness.exe` (DeepSeek favicon as the app icon), spawns `dsh web --no-open` with `CREATE_NO_WINDOW`, shows a splash until the authenticated `dsh web: http://…` readiness line from `@deepseek-ai/dsh-web-app` arrives, navigates WebView2 to that URL, and terminates the `dsh` process tree on exit. Each launch may run `pnpm install` via checkout `.runtime` Node + `corepack pnpm@11.7.0` when modules are missing or older than `pnpm-lock.yaml` (skip with `DSH_DESKTOP_SKIP_INSTALL`), then runs `pnpm run build:web` the same way (skip with `DSH_DESKTOP_SKIP_WEB_BUILD`), snapshots `apps/web/dist`, and sets `DSH_WEB_DIST_INDEX` so the open session ignores later frontend rebuilds. The shell never mounts Cordis or bypasses `dsh`. CLI resolution is `DSH_DESKTOP_CLI`, then walk upward from the running exe / process cwd / compile-time crate path, then `PATH`. Startup failures show a Windows message box because the release binary has no console. Extra argv after the exe are forwarded to `dsh web` after `--no-open`.

## Alternatives considered

**Chromium `--app=URL` handoff from `dsh web`.** Rejected for this request: the user asked for a desktop shell and an exe entry, not a browser app-mode flag.

**Shipping a release app under `apps/`.** Rejected for the first cut: the shell is a prototype with native toolchain prerequisites and no CI gate, so it stays in the experimental group until a stable owner and runner exist.

**Embedding the Web frontend inside the exe.** Rejected: the product UI remains the hosted `dsh web` dist; duplicating it would fork auth, assets, and release packaging.

**GitHub Release download on first launch.** Rejected for this cut: peers already pull the monorepo (including bundled `.runtime` Node); tracking the ~3MB root exe keeps double-click inside `git pull` without a second distribution channel.

## Consequences

Peer Windows hosts `git pull` and double-click repository-root `DeepSeek Harness.exe` (tracked). Maintainers who change the shell re-run `pnpm run desktop:web` and commit the new exe. Official releases and `verify-application-entrypoints` continue to treat `dsh` profiles as the only Node application launchers; this package adds no Node `bin`. Main CI does not compile the Rust target until a suitable runner is allocated.
