# dsh-mode-router

English | [中文](README.zh.md)

Per-turn mode routing for a DeepSeek Harness agent preset. Each turn the plugin reads that session's most recent user message, decides — deterministically, with keyword scoring and no extra model call — what this turn should be judged by, and injects that verdict as **dynamic context** through the official `systemPrompt.context` extension point. Dynamic context enters model history by default, so the injected text is in the session log and can be replayed and audited afterwards.

## Modes

| Mode | Selected when the turn is mainly… | Injected requirement |
| --- | --- | --- |
| `correct` | code, data, interfaces, commands — measurable behavior | collect checkable evidence (command output, test result, file line, response body) before concluding |
| `experience` | visuals, interaction, feel, copy | state the picture or interaction first; ask the user to look after the change instead of inferring from code |
| `research` | analysis, comparison, argument | cite a source for every conclusion and separate fact from inference |

No keyword hit, or a tie that resolves to nothing more specific, falls back to `correct`. Ties break `research` → `experience` → `correct`.

## Configuration

| Field | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | `false` mounts nothing and injects nothing |
| `order` | `130` | dynamic-context sort position, after the built-in sandbox (110), approval (115), and delegation (120) policies |

## Mount it

This package is a plugin row, not a bundle patch: a preset references it by name.

```yaml
- id: mode-router
  name: dsh-mode-router
  config:
    enabled: true
```

The author's deployment also ships a preset named `mode-router` under `$DSH_HOME/.agent-presets/mode-router/` that copies the shipped `standard` composition, adds this row, and carries the Chinese-language persona instruction inside the preset so a preset-level persona cannot shadow it. Other machines either run the community `dev.mjs` junction for `community/plugins/packages/*`, or build (`pnpm build`) and pack the package and add it like any other community plugin.

## Where the evidence lives

- Injected text is rendered into the model request as dynamic context, so it is reconstructable from the session log (`session.v3.jsonl.zstd`, multi-frame zstd; see the repository's session persistence for the format).
- The classifier is a pure function (`src/classify.ts`) with unit tests in `tests/classify.spec.ts`: same input, same verdict, and the matched keywords are part of the verdict for auditing.

## Known Limitations and Deferred Work

- Classification is keyword scoring, deliberately: it is free, deterministic, and explicable. It will misread terse messages that carry no domain words; the injected line names the matched keywords so a wrong verdict is visible rather than silent.
- The router changes what a turn is judged by. It does not add or remove tools, switch models, or change a session's preset — those remain session-level choices.
- Routing happens on the most recent user message only; a long turn whose subject changes mid-way keeps its first verdict.
