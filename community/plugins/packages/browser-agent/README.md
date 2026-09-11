# dsh-browser-agent

[简体中文](README.zh-CN.md)

Browser automation for DeepSeek Harness: model tools plus a Web panel that drive the user's **real Chromium
browser** through the [`bsk`](https://github.com/) CLI of browser-skill.

The plugin turns the browser-skill workflow (a prompt-only skill plus a CLI you have to call by hand) into
plugin-owned code: the tool surface is fixed, refs are refreshed automatically, and the automation session is
reclaimed by the plugin instead of by the model's memory.

## What it does

- Registers 12 model tools: `browser_open`, `browser_observe`, `browser_click`, `browser_fill`, `browser_press`,
  `browser_select`, `browser_history`, `browser_tabs`, `browser_ask_human`, `browser_evaluate`, `browser_status`,
  `browser_stop`.
- Owns the `bsk` session for every DSH session: lazy start on first use, and reclamation through four paths —
  explicit `browser_stop`, DSH session disposal (`agent/disposed`), plugin unload, and an idle sweep.
- Picks the target browser: with one connected instance it starts directly, with several it refuses and lists the
  candidates so the deployment can pin one through `browserInstance`, and with none it says exactly what to fix.
- Recovers from an externally killed session: a `session not registered` failure drops the stale record and tells
  the model to reopen the page, and the next call lazily starts a fresh session.
- Keeps refs honest: any navigation or click marks refs stale, and a ref-consuming tool re-snapshots before it
  writes, then snapshots again after the DOM may have changed.
- Defaults to observation-first: `browser_observe` returns the accessibility snapshot unless the caller asks for
  `html` or `screenshot`.
- Serves a right-sidebar tab "浏览器" with session state, tabs, the latest screenshot, and a Stop button.

## Requirements

1. `bsk` on `PATH` (browser-skill CLI, tested with 0.1.6).
2. A Chromium-family browser with the browser-skill extension loaded and connected (`bsk doctor` should be green).
3. DeepSeek Harness 0.1.5-rc.1 or later.

## Install

```sh
# from the community plugins workspace
pnpm --filter dsh-browser-agent build

# link it into a profile (dev loop: junction + Cordis HMR)
node community/plugins/dev.mjs
```

Then make sure the profile's `cordis.patch.yml` carries the row (dev.mjs adds the bundle entry; the row is what
the loader composes):

```yaml
- { id: browser-agent, name: dsh-browser-agent, disabled: false }
```

**A restarted `dsh web` is required the first time the plugin is composed.** Adding a bundle or patch entry to an
already-running instance is not picked up live (the HMR watch scope in the development setup does not cover the
profile patch file), so mount it and restart once.

## Configuration

Declared by the plugin's `Config` schema and overridable from `cordis.yml`:

| Field | Default | Meaning |
| --- | --- | --- |
| `binary` | `bsk` | Executable name or absolute path. |
| `browserInstance` | `''` | Target browser instance id or label; empty requires exactly one connected browser. |
| `workspaceRoot` | `process.cwd()` | Working directory for the `bsk` child process. |
| `idleTimeoutMs` | `600000` | Idle time before the sweep ends a session. |
| `actionTimeoutMs` | `30000` | Timeout for ordinary commands. |
| `navigationTimeoutMs` | `60000` | Timeout for navigation-class commands. |
| `snapshotMaxChars` | `24000` | Character cap for one snapshot handed to the model. |
| `screenshotDir` | `''` | Screenshot output directory; empty uses the `bsk` temp default. |
| `allowEvaluate` | `false` | Whether `browser_evaluate` may run at all. |
| `requireApprovalForBorrow` | `true` | Ask the harness approval service before borrowing a user tab. |
| `sensitivePatterns` | credentials keywords | Host substrings where scripting is refused. |
| `allowedPatterns` | `[]` | Non-empty restricts navigation to matching hosts. |

## Safety defaults

- `evaluate` is **off** unless the deployment turns it on, and is always refused on credential hosts
  (login/SSO/banking/password managers).
- `browser_tabs` lists the Agent Window (`scope: agent`) by default; the user's own tabs are only visible when a
  call explicitly asks for `scope: user`.
- Writes only ever reach tabs in the Agent Window; user tabs must be borrowed, which asks the harness approval
  service first (`requireApprovalForBorrow`), and are auto-returned on session stop.

## Verification

```sh
pnpm --filter dsh-browser-agent test            # 50 cases; the two real-browser cases skip by default
BSK_E2E=1 pnpm --filter dsh-browser-agent test  # all 52 cases against the real browser
```

`tests/composition.spec.ts` mounts the plugin in a real Cordis context and drives the tool definitions
themselves through a real browser, which is the same code path the model uses once the plugin is mounted in a
profile; `tests/client-panel.spec.tsx` covers the right-sidebar panel under jsdom.

## Known limitations

- **Full-tab screenshots fail on some Windows/Edge builds** (`cdp_failed: image readback failed`). The plugin
  detects this and retries with the root snapshot ref, which yields a viewport-equivalent PNG; the result's
  `note` reports the fallback.
- The panel polls on demand (mount + Refresh); it does not stream.
- **Development loop:** do not run `pnpm run build` while `dev.mjs` watches: its `clean` step empties `lib/` and
  races the incremental watcher builds (`UNRESOLVED_ENTRY` / `MISSING_EXPORT`, and the client bundle can go
  missing). Stop `dev.mjs`, build, then start it again.
- One `bsk` session per DSH session; parallel DSH sessions each get their own Agent Window.
