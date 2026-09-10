# Agent Note: Web replay lane repair on Windows

Status: implemented

English | [中文](2026-09-08-web-replay-windows-repair.zh.md)

## Problem

The `test:web` browser lane failed wholesale on Windows: generated seed fixtures crashed at parse time (`realizeSeedFixture` substituted `{{cwd}}` with unescaped backslashes), aria golden captures could not tokenize workspace basenames or preset roots (`split('/')` on backslash paths), persisted-replay comparison missed the JSON-quoted cwd spelling the sandbox-policy snapshot emits, the HMR scenario could not spawn the pnpm watcher shell-free, `pnpm run dev:web` crashed under Node 24 (tsdown's `import-without-cache` load hook composition with the tsx loader returned `undefined` for `.cjs` sources), and `preview-boot` never served its packed image (Windows `path.normalize` turns the leading separator into a backslash the override keys lack).

## Decision

Each failure gets the narrowest platform-correct repair:

- `realizeSeedFixture` escapes backslashes in the substituted cwd so the realized JSONL stays parseable on Windows.
- `normalizeAria` and the preset-authoring tokenizer split the workspace basename on either separator and canonicalize the suffix to `/`.
- `session-snapshot`'s `cwdSpellings` adds the JSON-quoted spelling (`\` doubled) so the policy snapshot text normalizes to `{{cwd}}`.
- `hmr-live` resolves the pnpm watcher invocation shell-free: `npm_execpath` when present, `cmd /c pnpm` on Windows otherwise.
- `dev:web` switches its launcher from tsx to plain Node type stripping — the scripts are erasable-syntax, and this removes the tsx + `import-without-cache` hook conflict that made the watcher crash on Node 24.
- `preview-boot`'s static responder strips both leading separator kinds after `normalize` and canonicalizes the relative path to `/`, and the showcase assertions expand each compact-folded owning turn before waiting for its file links (the settled turns render folded by default).
- The community dev loop (`community/plugins/dev.mjs`) creates the junction destination's parent first, so scoped plugins (`@ruihuahe/...`) mount on a fresh profile instead of failing with `ENOENT`; this is what kept any fresh-home `dsh web` boot — the HMR scenario included — from reaching the app.
- `hmr-live` pins the fresh home to the English surface before first boot and walks the first-run notice + workspace chooser before waiting for the hero, matching what a fresh home actually shows.
- Scenarios whose recorded fixtures drive the bash tool — which shipped presets mount only on POSIX — skip on Windows: `cordis-tool-round`, `goal-multi-turn-actions`, and the two live-tool chat-scroll tests, mirroring the existing approval-composer/ptc-round precedent.

## Alternatives considered

**Refresh the aria goldens instead of fixing the capture normalizers.** Rejected: the platform fixes make the committed goldens match on Windows, and the composer surface is still changing under concurrent work — refreshing would have baked in an in-flight UI state.

**Fix tsdown/import-without-cache instead of dropping tsx for dev:web.** Rejected: the bug lives in an upstream composition (`import-without-cache@0.4.0` returning a delegated `undefined` source), no fixed release exists yet, and the launcher change removes the conflict without losing any dev:web behavior.

**Gate the whole web lane on POSIX.** Rejected: most scenarios are platform-independent; the fixes keep them running on Windows and the bash-tool scenarios remain covered by the Linux PR gate.

## Consequences

Windows can run the web replay lane: seeded fixtures, aria goldens, persisted-replay comparison, HMR, and the preview worker boot all work locally; the bash-dependent scenarios stay Linux-gated like their precedents. `pnpm run dev:web` works under plain Node (type stripping is unflagged across the supported engine range) and was verified through an end-to-end rebuild. The lane's committed goldens remain unchanged, ready for the in-flight composer rework to land.
