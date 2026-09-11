---
description: "Web settings card for the Codex importer: the auto-sync toggle, a manual import action, and durable import history in the Plugins configuration tab."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-codex-import

English | [中文](README.zh.md)

## Summary

`dsh-client-ui-codex-import` renders the Codex import card in the Web **Plugins** configuration tab for the `codex-import` settings namespace that [`dsh-session-import-codex`](../../session/session-import-codex/README.md) serves. The card holds a sync toggle bound to the namespace's `autoSync` field, an **Import now** action that runs one sweep, and the durable run history returned by the `codexImport` Remote; each run expands to its imported sessions, which open on click. The Host half is an empty plugin so the browser feature stays addressable from the Loader overlay.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Open **Settings → Plugins** in the Web client and expand the `codex-import` card. The card is collapsed by default like every other plugin card; expanding it shows:

- **自动同步 / Auto sync** — writes the namespace's `autoSync` field through the settings scope. Turning it on makes the Host run one sweep immediately and then repeat at its configured interval; turning it off leaves the manual action as the only trigger.
- **Import now** — calls the `codexImport` Remote's `run()` and reports the resulting run. The action stays available regardless of the toggle.
- **Import history** — the runs returned by `history()`, newest first, each foldable into the sessions it imported. Selecting a session opens it in the conversation region.

The card owns no import logic: reading Codex, converting threads, and writing sessions all happen in [`dsh-session-import-codex`](../../session/session-import-codex/README.md).

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

`apply` registers the `codex-import` dictionary and one `settings.plugin.item` entry keyed by the namespace. The registered component receives a controller-built inject face: a store snapshot (busy flags, the latest run, the history), the current settings scope value, and callbacks for toggling sync, running an import, opening a session, and selecting a card. The controller subscribes to the settings scope, refreshes history after each run, and disposes both the subscription and the slot registration with the plugin fiber.

Because the card renders inside the Plugins tab, it appears wherever that tab is registered; the package registers nothing into the conversation or sidebar.

-----

<a id="further-exploration"></a>
## Further Exploration

- [Codex session import](../../../docs/subsystems/session-import.md) — the imported-session vocabulary, the `codexImport` Remote, and the `autoSync` settings namespace this card drives.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

**Runtime invariant:** no companion is published. The package registers one settings card plus its dictionaries, owns no cross-plugin mutable state, and its inject face is the controller's snapshot and callbacks.

</details>

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the imported session logs a model later continues.

#### KV Cache effect

The card itself builds no context: it triggers the Host sweep and reads back the run records. Imported user, assistant, and tool messages enter a model request only when an agent continues one of those sessions, and the agent loop and that session's preset own every model-visible addition.

## Known Limitations and Deferred Work

- **Browser-only** — the package contributes nothing on the Host face beyond an empty `apply`, so a client without the Plugins tab renders the card nowhere.
- **One namespace, one card** — the card is bound to `codex-import`; a second importer would need its own namespace and card.
- **History is read-only** — the card shows recorded runs but cannot delete them; retention belongs to the Host package.
- **No progress reporting** — a sweep reports only its finished run, so a long import shows the busy state until the Remote resolves.
