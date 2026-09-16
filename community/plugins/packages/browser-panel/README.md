# DeepSeek Harness Browser

> 本目录是二次开发版本：改造清单、挂载方式与 browser-use attach 配置见 [README.zh.md](README.zh.md)。
> 下面是上游原文。

> ### ⚠️ Unofficial community project
>
> **Not affiliated with, endorsed by, or maintained by DeepSeek AI.** This is a
> third-party plugin for their open-source harness. For the official project see
> [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness).
> Please do not report issues with this repo to DeepSeek.

**A browser pane inside the harness, beside the chat.** A real Chrome the human
can watch and type into, plus rendered previews of local files — and three tools
that let the model drive it and read what is on screen.

The pane is a **real layout column**: the conversation gives up space rather than
being covered. Measured 907px → 447px when it opens, and back on close.

---

## What it does

**Web pages open in a real Chrome**, driven over the Chrome DevTools Protocol
with its own persistent profile. You can log in. You can type. Sites that refuse
to be framed work, because nothing is being framed.

**Local files are rendered**, not linked:

| kind | shown as |
|---|---|
| `.md` | formatted document — headings, tables, code, task lists, quotes |
| `.html` | the real page, with its relative images and styles resolving |
| images | framed on the app background |
| **PDF** | **page images**, rendered server-side — no browser PDF viewer needed |
| code / text / config | syntax-framed with language and line count |

**Clicking a link or a file path in the chat** opens it in the pane.

**Saving a file to your own machine.** A **↓** button appears in the toolbar
whenever the pane is showing a file. It serves the real bytes with
`Content-Disposition: attachment` rather than the rendered page you are looking
at. This matters most when the harness is on **another machine** — the file
lives over there, and until now the pane only ever showed you a picture of it.

The button is deliberately absent for web pages: "download" is not a meaningful
action on a live page, and a button that does nothing is worse than no button.

---

## The three model-facing tools

- **`open_preview(url, label?)`** — a web page or a local file. Accepts bare
  domains (`cnn.com`), http(s) URLs, `localhost:PORT`, and file paths
  (`C:\path\file.md`, `/abs/path`, `file:` URLs).
- **`read_preview(start?, count?)`** — what is on screen, as text. Pages through
  with `start=end` when `end < total_chars`.
- **`close_preview(url?)`** — one tab, or the whole pane.

`read_preview` answers from the right source for each kind:

| showing | read from |
|---|---|
| web page | the **live DOM** over CDP — `document.body.innerText` |
| PDF | the document's **text layer** (PyMuPDF), not the page images |
| local file | the rendered page |

---

## Why a real browser, and not an iframe

This is the central design decision, and it was reached by measurement rather
than preference. An iframe cannot do this job, for three independent reasons:

1. **Sites refuse to be framed.** `x.com` sends `X-Frame-Options: SAMEORIGIN`
   plus a CSP `frame-ancestors 'self'`; `reddit.com` sends `SAMEORIGIN`. The
   browser obeys, and the pane renders blank.
2. **Cookies default to `SameSite=Lax`**, which the browser withholds inside a
   cross-site iframe. Even a framable site renders **signed out**, with a valid
   session sitting right there unused.
3. A server-side proxy fetches anonymously, so it cannot hold a session at all.

Only (3) is fixable in userland, and fixing it would not have helped.

So `cdpbrowser.js` launches Chrome with a dedicated profile, attaches to a page
target over one WebSocket, and the pane mirrors it while forwarding clicks,
scroll and keystrokes back as CDP input events. No dependency is needed — CDP is
JSON over a socket, and Node has `fetch` and `WebSocket` built in.

**On cookies and safety.** A real browser is *safer* than the proxy it replaced,
not riskier: cookies stay in Chrome's own encrypted store with per-origin
isolation and SameSite enforced by the browser. Nothing is copied into a jar of
this project's invention. The profile is **dedicated**, so the user's daily
browser is untouched (Chrome cannot open one profile twice) and a login here
persists.

### It is a stream, and that is worth saying plainly

The pane shows JPEG frames of a real browser. It is not an embedded Chromium
surface — a page cannot host one, and the harness UI is a page. If you want a
true embedded surface, this is not that, and no amount of tuning makes it that.

What it is: a responsive viewport onto a real, logged-in browser, where the
**agent** reads the actual DOM rather than anything mirrored.

**If you want the real thing, there is an optional desktop shell.** A ~130-line
Electron wrapper loads this same UI in a window where `<webview>` exists, and the
plugin feature-detects it: the pane becomes an actual embedded browsing context
with native input and scrolling, and no second Chrome is launched at all. It is
strictly additive — in a plain browser tab nothing changes, and deleting the
shell folder reverts you with nothing to undo.

See **[docs/DESKTOP-SHELL.md](docs/DESKTOP-SHELL.md)**; the source is in
[`shell/`](shell).

---

## Frames are pushed, not polled

`Page.startScreencast` emits a frame only when the page repaints; the host
forwards each over Server-Sent Events. Measured **~22fps, first frame 59ms** —
against ~2fps and up to 450ms of stale pixels for the polling version this
replaced.

Two findings made that possible, both non-obvious:

**Chrome does not paint a window it believes nobody can see.** The window is
launched off-screen so it stays off the desktop — and that alone produced
**zero** screencast frames, which is what forced screenshot polling and made the
pane feel like a remote desktop. Four flags fix it, and the window stays hidden:

```
--disable-backgrounding-occluded-windows
--disable-renderer-backgrounding
--disable-background-timer-throttling
--disable-features=CalculateNativeWinOcclusion
```

Measured: **0 frames → 176.**

**Uncapped, Chrome pushes ~100fps** (~4.5 MB/s at 46KB a frame) — far more than
a reading pane needs, and enough to thrash the client. The host coalesces to
~25fps, holding it near 1 MB/s.

---

## Requirements

- `dsh` installed (`npm i -g @deepseek-ai/dsh`) — built against **0.1.0-rc.6**
- **Node** `^22.19.0 || >=24.0.0` (needs global `fetch` and `WebSocket`)
- **Chrome or Edge** — for the live browser
- **pnpm** — `dsh plugin` shells out to it
- *Optional:* **Python + PyMuPDF** (`pip install pymupdf`) for PDF rendering.
  Without it, PDFs fall back to the browser's own viewer.

## Install

```sh
dsh plugin --profile web add /absolute/path/to/DeepSeek-Harness-Browser/plugin
```

Then copy [`examples/cordis.patch.yml`](examples/cordis.patch.yml) into
`$DSH_HOME/profiles/web/cordis.patch.yml` (default `$DSH_HOME` is `~/.dsh`), and
restart with `dsh web`.

Plugins resolve from the **profile** directory. Putting one in the dsh install's
`node_modules` crashes *every* profile on boot with `ERR_MODULE_NOT_FOUND`.

---

## How it fits together

```
      dsh host process                          the web GUI at :3080
┌──────────────────────────────┐        ┌──────────────────────────────┐
│ index.js                     │        │ client.js                    │
│  · open/read/close_preview   │        │  · the pane, in a real       │
│  · /api/preview/* bridge     │◀──────▶│    layout column             │
│                              │        │  · <img> of pushed frames    │
│ cdpbrowser.js ──CDP──▶ Chrome│        │  · forwards clicks + keys    │
│ filerender.js  md/html/img   │        │  · renders local files in an │
│ pdfrender.js   PDF→img+text  │        │    <iframe>                  │
│ webproxy.js    fallback      │        └──────────────────────────────┘
└──────────────────────────────┘
```

`index.js` is the host half; `client.js` is served to the page because
`package.json` declares `dsh.client.platform: "web"`. One plugin entry, two
halves.

---

## Things that cost real debugging time

Recorded because none of them are guessable.

**A drain-on-read command queue breaks with two panes open.** Commands were
`splice`d off a queue, so whichever pane polled first swallowed them and every
other pane missed the navigation entirely — which looks exactly like
"`open_preview` is broken". Commands now carry a sequence number and are
retained briefly; each pane tracks the last it saw.

**A prefix route ending in `/` never matches.** dsh's matcher tests
`pathname === prefix || pathname.startsWith(prefix + '/')`, so a registered
prefix of `/api/preview/asset/` is looking for a double slash. Register it
without the trailing slash.

**`file:` URLs cannot be framed inside an http page.** Chrome refuses, and the
frame renders nothing. Local files must be *served* by the host — which also
makes them same-origin, and therefore readable.

**A local HTML file needs a `<base>` tag** or its relative `<img src>` resolve
against the harness origin and 404 — the page renders with every image blank.

**Serve assets as raw bytes.** Running an image through the renderer wraps it in
a styled HTML page; feeding *that* to an `<img>` tag shows nothing.

**Published dsh sub-packages can be a different generation.**
`@deepseek-ai/dsh-tools` on npm is `0.0.1-rc.1` against a harness of
`0.1.0-rc.6`, and `dsh-web-search-exa@0.0.1-rc.1` imports a package that was
never published — installing it takes the whole profile down. Link the harness's
own copy.

**Do not let a read fall back to a previous page.** An earlier version, on
finding the active tab not yet rendered, returned the last tab that *had*
rendered. A tab labelled Google returned CNN's text and the agent reported it as
current. Labelling that answer with a warning was the wrong fix; not producing it
is the right one. If a page has not rendered, the answer is "still loading".

---

## Security

**The pane can hold real logged-in sessions.** It is driven by an agent. If that
agent runs without approval prompts, it can navigate, click and type in a
browser holding the user's accounts. Tell it not to sign in or out, post,
purchase or send anything unasked, and never to solve a CAPTCHA — and understand
that this is guidance, not enforcement.

**Proxied pages are sandboxed without `allow-same-origin`.** Everything the pane
shows is served from the harness's own origin, so `allow-scripts` +
`allow-same-origin` together would let an arbitrary site's JavaScript reach
`parent` and read the app around it. Local files are unsandboxed (own content,
and required for the PDF viewer); external pages are given an opaque origin.

**The asset route refuses to escape its directory.** The token names a directory
and a `../` in the relative part is rejected — otherwise page content could
drive an arbitrary file read.

---

## License

MIT — see [LICENSE](LICENSE).
