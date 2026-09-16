# Optional: the desktop shell

*A ~130-line Electron wrapper that upgrades the browser pane from a **stream of**
a browser into **an actual embedded browser**.*

Entirely optional. The plugin works without it, and nothing here is required to
use this repo. If you skip it, you get the CDP stream described in the main
README — which is good, but it is a mirror. This makes it not a mirror.

---

## The problem it solves

The harness UI is a web page. A web page **cannot embed a real browsing
context** — that is a browser-level capability, not a page-level one. So the
plugin does the only thing a page can do: it drives a separate Chrome over CDP
and mirrors the pixels back, forwarding your clicks and keystrokes the other way.

That works, and it is genuinely responsive (~22fps, first frame 59ms). But it is
a mirror, with everything a mirror implies: an encode/decode per frame,
coordinate scaling, input travelling a round trip before anything happens, and
text selection that is really a picture of text.

Load the **same page** inside an Electron shell and it gains one element it
cannot otherwise have: `<webview>`. That is a real browsing context in its own
process, with its own session. The pane stops being a picture of a browser and
becomes one.

| | plain browser tab | desktop shell |
|---|---|---|
| surface | `<img>` of JPEG frames | `<webview>` — a real browsing context |
| input | forwarded as CDP events | **native** — the element handles it |
| scrolling | streamed frames | native, at the platform's own frame rate |
| text selection | a picture of text | actual selectable text |
| agent reads | live DOM over CDP | live DOM via `executeJavaScript` |
| needs Chrome running | yes, a second one | no — the pane *is* the browser |
| extra install | none | Electron (~150MB) |

The most telling confirmation during development was accidental. After the shell
was wired up, the state pushes showed the pane navigating to a page nobody had
scripted it to — because the human had simply clicked a link and typed in the
address bar. **Native input, with no forwarding layer involved.** The agent's
`read_preview` followed along correctly, which is the behaviour that matters:
the agent reads wherever *the human* browsed, not only where it navigated.

---

## It is strictly additive

The plugin **feature-detects** the shell and picks a surface at render time:

```js
var IS_SHELL = typeof navigator !== "undefined"
    && /Electron\//.test(navigator.userAgent || "");
```

Detected from the user agent rather than a Node global, because the shell runs
the renderer with `nodeIntegration` off — there is no `window.process` to test.

Every shell-specific branch is guarded by that flag, so:

- **In a plain browser tab, nothing changes.** Same stream, same code path.
- **In the shell, the stream is never started** — no second Chrome is launched.
- **Delete the shell folder and the shortcut silently falls back** to the old
  behaviour. Nothing to undo.

Both paths were verified after the change, not assumed:

```
plain browser : is shell = false → { webviews: 0, streamImg: true }
desktop shell : is shell = true  → { webviews: 1, url: "https://news.ycombinator.com/",
                                     title: "Hacker News", loading: false }
```

---

---

## Connecting to more than one harness

A harness may be on this machine or on another one. The shell is only a viewer,
so switching between them is *"reload against a different URL"* — plus whatever
command has to run first to make that URL reachable.

A slim strip at the top of the window shows where you are and switches:

```
┌────────────────────────────────────────────┐
│  ● 5080  ▾                                 │  ← green = local, blue = remote
├────────────────────────────────────────────┤
│           the harness, as normal           │
└────────────────────────────────────────────┘
```

Click the pill for the list, or use **⌘1 / ⌘2** (`Ctrl` on Windows). The window
title always reads `DeepSeek Harness — <name>`, because two identical windows
onto different harnesses — different sessions, different files — is exactly the
setup where you ask the agent something and get a confident answer from the
wrong machine.

The strip is the shell's own view, layered above the harness rather than
injected into it. The harness page belongs to the harness; a shell that rewrote
it would break on every harness update.

### The connection list

`~/.dsh-shell/connections.json`, written on first run:

```json
{
  "active": "local",
  "connections": [
    { "id": "local", "name": "Local", "url": "http://127.0.0.1:3080", "local": true },
    {
      "id": "workstation",
      "name": "Workstation",
      "url": "http://127.0.0.1:3081",
      "preConnect": "ssh -N -L 3081:127.0.0.1:3080 me@100.64.0.1"
    }
  ]
}
```

### `preConnect`, and why it is not an SSH feature

`preConnect` runs before connecting; the shell then waits for `url` to answer,
and kills the command when you switch away or quit.

**The shell has no idea what the command does.** That is the point. An SSH
tunnel, `tailscale serve`, a corporate VPN script, `kubectl port-forward` — all
the same to it. Teaching the app about SSH specifically would drag in every
platform difference in key paths, agents and `IdentitiesOnly` handling, and it
would still not cover the person whose remote access looks nothing like yours.

If the URL already answers, `preConnect` is skipped entirely — a tunnel you
started by hand is as good as one the shell started, and a second would collide
on the port.

`preConnect` can also *start a local harness*: `"dsh web --port 3081"` boots one
on demand and shuts it down when you leave.

### Reaching a harness on another machine — read this part

**`dsh` has no authentication of its own.** It binds `127.0.0.1` by default, and
that default is load-bearing. Do not "simplify" remote access by binding it to
`0.0.0.0`: on any shared network that hands a stranger an agent that can run
commands, with a browser pane holding your logged-in sessions.

Use a tunnel or a private network (Tailscale, WireGuard) so the harness stays on
loopback and the URL genuinely *is* `127.0.0.1`. That also keeps the harness's
`/api` browser-trust fence satisfied without extra configuration.

---

## Install

From the repo root:

```sh
cd shell
npm install
npm start
```

Start the harness first — the shell waits up to 40 seconds for it, then offers to
open anyway rather than dying silently. Point it elsewhere with `DSH_URL`:

```sh
DSH_URL=http://127.0.0.1:3081 npm start
```

### Making a desktop launcher start it (Windows)

If you already start the harness from a shortcut, have that script prefer the
shell and fall through if it is absent:

```powershell
$shellDir = Join-Path $env:USERPROFILE 'dsh-shell'
$electron = Join-Path $shellDir 'node_modules\electron\dist\electron.exe'

if ((Test-Path $electron) -and (Test-Path (Join-Path $shellDir 'main.js'))) {
    Start-Process -FilePath $electron -ArgumentList '.' -WorkingDirectory $shellDir
} else {
    Start-Process "http://127.0.0.1:3080"      # old behaviour
}
```

**Do not add `-WindowStyle Hidden`.** See the traps below — it costs you the
window.

---

## How the two halves change

### Client: choose a surface

```js
(activeTab && activeTab.live)
    ? (IS_SHELL
        ? h(ShellView, { url: activeTab.url, viewRef: webviewRef, ... })
        : h(LiveView, { key: "live" }))
    : ...
```

`ShellView` builds the `<webview>` **imperatively** — see the traps section for
why that is not a style preference.

### Client: read the embedded DOM

A `<webview>` exposes `executeJavaScript`, so the pane extracts real rendered
text and pushes it to the host exactly as it always did:

```js
wv.executeJavaScript("document.body ? document.body.innerText : ''")
```

It also pushes the webview's **actual** URL rather than the tab's original one.
A redirect or a clicked link moves the view without going through `navigate`, and
reporting the address you *asked for* alongside text from the page you *landed
on* is precisely how a confident wrong answer gets manufactured.

### Host: do not ask the wrong browser

Each push is tagged with the surface that produced it:

```js
mode: (IS_SHELL && tab.live) ? "webview" : "stream"
```

`read_preview` honours it:

```js
const paneOwnsBrowser = activeState?.mode === 'webview'
if (activeTab?.siteUrl && !paneOwnsBrowser) { /* ask the CDP browser */ }
```

Without that tag there is a real failure mode: a CDP Chrome left running from an
earlier session is still reachable, still has a page open, and will answer
cheerfully — **about a completely different page**. The tag is what stops the
host consulting a browser that is not the one on screen.

---

## Traps that cost real time

**`-WindowStyle Hidden` gives you an invisible app.** Electron is a GUI app, so
it never flashes a console — the flag looks free. It is not: Chromium honours the
`SW_HIDE` startup flag for its first window, so the app launches, runs, and shows
nothing. Four processes, zero window handles, no error anywhere.

**Do not let React manage the `<webview>`.** React has no knowledge of the
element and will fight its navigation handling — managing `src` as a plain
attribute re-navigates on re-render, losing scroll position and form state.
Create it with `document.createElement` in a mount-once effect and keep React out
of it.

**Guard the navigate effect with a URL comparison.** The webview reports its
landed URL back up, which updates the tab, which re-runs the effect. Without a
comparison that tolerates a trailing slash and a scheme, a redirect bounces you
back to the address you typed, forever:

```js
if (sameTarget(safeUrl(el), props.url)) return;
```

**Every webview getter throws before the element is attached.** `getURL()`,
`getTitle()`, `executeJavaScript()` — all of them, and a rejected promise inside
the state push stalls the push. Wrap them, and put a timeout on the read so a
page mid-navigation resolves empty rather than hanging.

**Use a `persist:` partition.** `partition="persist:dshbrowser"` gives the pane
its own durable session, so a login survives a restart and the user's daily
browser is untouched. A non-persistent partition looks identical until you
restart and find yourself logged out of everything.

---

## What this does not change

- **It is not a security boundary.** The pane can hold real logged-in sessions
  and an agent can drive it. That was true of the stream and it is true here. The
  main README's Security section applies unchanged.
- **File, markdown and PDF preview are untouched.** They were already real
  rendered documents in an iframe; the shell adds nothing and takes nothing away.
- **It is one browser tab, not many.** The live tab is still a single view. Per-tab
  webviews are a natural next step and are not implemented.
- **There is no packaging.** No installer, no code signing, no auto-update — this
  runs Electron from `node_modules`. Shipping it as a real app is a separate
  project with its own signing and update concerns.

---

## Reversing it

Nothing is one-way:

- **Stop using it:** open `http://127.0.0.1:3080` in a normal browser. The pane
  detects no shell and streams, as before.
- **Remove it:** delete the shell folder. A launcher written as above falls
  through to the browser on its own.
- **Remove the plugin support too:** the shell branches are additive and guarded
  by `IS_SHELL`; deleting them leaves the original stream path intact.

The shell is a *viewer*. It stores no state of its own beyond the browsing
session in its partition, and the harness neither knows nor cares whether it is
running.
