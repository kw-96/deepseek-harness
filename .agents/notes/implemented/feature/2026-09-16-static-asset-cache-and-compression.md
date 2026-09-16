# Agent Note: Hashed Web assets cache immutably and the deployment compresses at level 6

Status: implemented

English | [中文](2026-09-16-static-asset-cache-and-compression.zh.md)

## Problem

A cold load of the Web GUI pulls a 5 MB (gzip) batch of plugin bundles plus the Vite assets. The Vite assets (`/assets/<name>-<hash>.<ext>`) were served with only a `content-type` header — no `Cache-Control`, no `ETag`, no `Last-Modified` — so every reload re-downloaded them even though their file names already carry a content hash. Measured on a remote link over a Tailscale DERP relay (~450 ms round trip), that re-download dominated the reload cost, while the plugin-bundle route (the 5 MB part) already cached immutably.

## Decision

`serveStatic` adds `Cache-Control: public, max-age=31536000, immutable` exactly for paths matching `/assets/<name>-<hash>.<ext>`, the Vite build-output naming, and leaves every other path without a cache directive. The plugin-bundle route is untouched: `/plugins/<id>/client.js` already ships `immutable` with a `rev` query.

The deployment's webserver row raises `compressionLevel` from 1 to 6, which shrinks the same payload without changing whether a response is compressed (the middleware already skips `text/event-stream`).

## Alternatives considered

**Cache the whole dist root.** Rejected: `index.html` is rendered per request (plugin injection rows run there) and unhashed assets can change in place; caching either would pin a browser to a stale shell.

**Add `ETag`/`Last-Modified` to every static response.** Rejected for this change: it requires conditional-request handling on both sides, while the hashed assets — the class that matters — need no revalidation at all.

**Cache the plugin-bundle route too.** Rejected: those paths carry no hash in the file name, so a plugin update or removal would keep serving the old client bundle.

## Consequences

Reloads stop re-fetching the Vite assets (~440 KB gzip) and cold loads ship less data at level 6. `index.html`, unhashed files, and `/plugins/*` keep their previous behavior, so upgrades and plugin changes still take effect on the next load. A stale `assets/*` file can only be requested by an old `index.html`, which is not cached, so a normal upgrade never requires clearing the browser cache.
