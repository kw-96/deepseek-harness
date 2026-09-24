# dsh-github

English | [中文](README.zh.md)

One npm package carrying the whole GitHub connector: the **`ctx.github` capability seam**, its REST v3 provider, the model-facing `github_*` tool suite, the Device Flow connect service, and the web UI (Connect GitHub card plus conversation PR status bar). It consolidates the five packages `dsh-github`, `dsh-github-rest`, `dsh-tool-github`, `dsh-github-connect`, and `dsh-ui-github` into one installable without merging their responsibilities: each keeps its own module tree under `src/` and is mounted as its own host row.

| Host row | Module | Role |
|---|---|---|
| `github` | `dsh-github` | Service Definition: `ctx.github`, provider registry, selection policy, read/write vocabulary, seam-enforced diff budgets, the `GitHubError` taxonomy |
| `github-rest` | `dsh-github/rest` | Provider: GitHub REST v3 over platform `fetch`, credential resolution, pagination, rate-limit and error mapping, idempotent PR creation, GHES `baseURL` |
| `tool-github` | `dsh-github/tools` | Consumer: the model-facing `github_*` tool schemas, validation, prompt guidance, tool-layer budgets, presentation |
| `github-connect` | `dsh-github/connect` | `ctx.githubConnect`: Device Flow authorization, deterministic flow-state detection, the `@Remote` button methods |
| `ui-github` | `dsh-github/ui` | Web UI node half and the `./client` bundle: the Connect GitHub settings card and the conversation PR status bar |

`cordis.patch.yml` inserts exactly these five rows under their original row ids. Row order carries no load semantics (activation is service-availability driven), so the connector composes the same host in any order.

## Service API (`ctx.github`)

| Member | Semantics |
|---|---|
| `registerProvider(provider)` | Register a backend. Throws `GitHubError` `GITHUB_PROVIDER_DUPLICATE` on a duplicate id. Returns a disposer. Disposed with the calling fiber. |
| `search(request, signal?)` | Resolve the provider and run one search. Enforces `request.maxResults` on the result (truncates `items[]`, sets `truncated`). |
| `getIssue` / `getPullRequest` / `getComments` / `getChecks` | Normalized on-demand reads. PR metadata never embeds diff or checks — they are separate calls. |
| `getDiff(item, request?, signal?)` | Read a PR diff, enforcing the consumer-owned `maxFiles` / `maxPatchChars` budgets at the seam (ADR-0005). `truncated` is honest: true whenever ANY reduction happened, provider-side or seam-side. |
| `getReviews` / `getReviewComments` | Submitted review verdicts, and the line-anchored comments they carry. `GitHubReviewComment` is deliberately NOT `GitHubComment`: it has a path and a line, and you act on it by editing that code. |
| `getCheckFailures(item, request?, signal?)` | Why the failing checks failed: annotations when the CI tool reported them, otherwise a log **tail** under the consumer-owned `maxLogLines` / `maxLogChars` budgets (ADR-0015). Same honesty rule as `getDiff` — a provider-truncated log alone marks the whole result truncated. |
| `buildReviewBrief(item, request?, signal?)` | The deterministic half of a structured review (ADR-0013): route the dimensions this change actually warrants, carry its diff **once**, and attach the checklists, severity scale, and finding contract. Routes and packages evidence; never judges. |
| `getMergeability` / `listPullRequests` | Merge readiness with its blockers spelled out, and a capped pull request listing. |
| `submitReview` / `updatePullRequest` / `requestReviewers` / `setLabels` | The review-write half. The seam validates inline-comment anchors but does NOT decide whether a verdict is allowed — that policy is about what the MODEL may do, so it lives at the tool layer (ADR-0014). |
| `createIssue` / `createComment` / `createPullRequest` | Writes. PR creation is idempotent (ADR-0004): an existing open PR for the same head/base comes back with `created: false`. |

Reads and writes are deliberately ONE provider interface (ADR-0003): they share identity, credentials, and rate-limit budget, so splitting them would let authentication state diverge.

Providers register **capabilities**, not tools. The `dsh-github/tools` row is the only owner of model-facing names, descriptions, prompt guidance, JSON schemas, and presentation.

## Selection

Selection never depends on registration, config, or HMR order. Either an explicit provider id is configured (config `provider`, or env `$DSH_GITHUB_PROVIDER` feeding the same field), or exactly one usable provider auto-selects. Operations resolve the provider at execution time, on EVERY call — never cached — so a credential change flips `available()` without restart:

| Situation | Execution |
|---|---|
| configured id registered and `available()` | runs that provider |
| configured id not registered | `GITHUB_PROVIDER_CONFIGURED_MISSING` |
| configured id registered but unavailable | `GITHUB_PROVIDER_CONFIGURED_UNAVAILABLE` |
| no id, exactly one registered usable provider | runs it |
| no id, no usable provider | `GITHUB_PROVIDER_UNAVAILABLE` |
| no id, multiple usable providers | `GITHUB_PROVIDER_AMBIGUOUS` |

A provider's `available()` is a cheap local check (credential ref resolvable) and **must not make network calls**.

## Vocabulary

`GitHubRepoRef` (`owner`, `repo`) and `GitHubItemRef` (`repo`, `number`, `url?`) are the portable handles the model passes between tools. Read shapes: `GitHubIssue`, `GitHubPullRequest` (`merged` is a first-class state), `GitHubComment`, `GitHubDiff` (`files[]`, `truncated`), `GitHubChecksResult`. `GitHubSearchKind` is a CLOSED union (`issues` | `pull-requests` | `repositories` | `code`) — consumers `switch` to exhaustiveness. Writes: `GitHubIssueCreateRequest`, `GitHubCommentCreateRequest`, `GitHubPullRequestCreateRequest` → `GitHubPullRequestCreateResult` (`pullRequest`, `created`). The seam validates refs (non-blank owner/repo, positive-integer numbers) and budget parameters as `GITHUB_VALIDATION`. See `src/types.ts` for the full contracts and the `GitHubError` code taxonomy (`GITHUB_AUTH`, `GITHUB_RATE_LIMITED` + `retryAfterMs`, `GITHUB_NOT_FOUND`, `GITHUB_VALIDATION`, `GITHUB_ABORTED`, `GITHUB_PROVIDER_*`).

## REST provider (`dsh-github/rest`)

The **REST v3 provider** for `ctx.github`: plain platform `fetch` (ADR-0006, no octokit), registered as provider id **`rest`**. It maps the endpoint set onto the seam's normalized vocabulary and keeps every policy the seam contract demands: per-operation credential resolution, honest truncation, no built-in retries.

### Configuration

| Field | Default | Semantics |
|---|---|---|
| `credentialRef` | `GITHUB_TOKEN` | Environment-variable NAME the token resolves through — a reference, never the secret itself, so the settings document stays token-free. |
| `baseURL` | `https://api.github.com` | API root. Point it at `https://ghes.example.com/api/v3` for GitHub Enterprise Server; trailing slashes are tolerated. |

The config belongs to this plugin's composition entry. The Loader validates a changed section against the schema above and restarts this plugin, so `apply` receives the configuration in effect and the provider re-reads it on every operation — a new `credentialRef` or `baseURL` reaches the next GitHub call. DSH 0.1.7 removed `installSettingsSection`/`settingsNamespace`, and its Settings service projects only fields a plugin declares `.volatile()`; these two fields are ordinary configuration, edited through the entry config rather than a settings form.

### Credential resolution

Resolved fresh on EVERY operation (a rotated token reaches the next call without restart): the optional credentials seam (`ctx.get('credentials')`) wins when mounted and configured; the process environment is the fallback either way — the CLI path of exporting `GITHUB_TOKEN` just works with no seam mounted. `available()` stays a cheap local check (seam mounted, or env value non-blank) and never touches the network; an unconfigured credential surfaces per-operation as `GITHUB_AUTH`.

### Transport policy

- **Pagination**: `Link`-header following with a hard cap of 10 pages; comments, diff files, and check runs aggregate across pages. Diff reads stop early once a `maxFiles` budget is satisfiable and report `truncated` honestly (ADR-0005 — the seam still enforces the budgets).
- **Rate limits**: 403/429 carrying `retry-after` or an exhausted primary quota map to `GITHUB_RATE_LIMITED { retryAfterMs }`. The provider NEVER retries — the caller owns that decision (seam contract).
- **Error mapping**: 401 → `GITHUB_AUTH`, 404 and 410 → `GITHUB_NOT_FOUND` (410 is what an expired Actions log returns — an absence, not a transport fault), 422 → `GITHUB_VALIDATION` (API message preserved verbatim), abort → `GITHUB_ABORTED`, transport failure → `GITHUB_PROVIDER_NETWORK`, everything else → `GITHUB_PROVIDER_HTTP`.
- **CI failure evidence** (ADR-0015): annotations first; the job log is fetched only when a failed run reported none (or the caller asks for it explicitly). The log endpoint redirects to object storage, which is followed **manually and without the `Authorization` header** — the signed URL carries its own grant, and forwarding the user's token to a storage host would leak it. A run whose `details_url` names no Actions job simply has no log.
- **Review writes**: `POST /pulls/{n}/reviews` for submissions (inline comment sides map to the wire's `LEFT`/`RIGHT`), `PATCH /pulls/{n}` for field updates, `POST /pulls/{n}/requested_reviewers`, and labels via `POST` (add) or `PUT` (replace). GitHub's terse 422 for approving your own PR is rewritten into a sentence that says what happened.
- **Idempotent PR creation** (ADR-0004): look up the open PR for the exact head/base first (`created: false` on a hit), POST on a miss, and on a lost race (422 "already exists") look up once more and return the winner's PR.

## Model tools (`dsh-github/tools`)

The **model-facing `github_*` tool suite** over `ctx.github`. This row owns schemas, validation, prompt guidance, tool-layer budgets, and presentation — never providers, transport, or credentials.

| Tool | What it does |
|---|---|
| `github_search` | Search issues / pull-requests / repositories / code (CLOSED kind union). Lean hits: `owner/repo#N [state] title` + URL. |
| `github_issue_read` | Title, state, labels, body, plus capped aggregated comments. |
| `github_pr_read` | Split into on-demand parts: `metadata` (default) / `diff` / `comments` / `reviews` / `checks` / `ci-failures` — one call never pays for data the model did not ask for. |
| `github_pr_review` | Assemble the structured review task for one PR: diff (once), the dimensions that apply to these changes, each one's checklist, the severity scale, and the finding contract. Evidence and a contract — not a verdict (ADR-0013). |
| `github_pr_list` | List a repository's pull requests, filtered by state and head/base. Read-only. |
| `github_issue_create` | Write, approval-gated. |
| `github_issue_comment` | Write, approval-gated. |
| `github_pr_create` | Write, approval-gated, idempotent (an already-open PR for the same head/base is a normal answer, not an error). |
| `github_pr_review_submit` | Write, approval-gated. Submits a review with inline comments. `APPROVE` / `REQUEST_CHANGES` exist only when `reviewVerdicts` is on (ADR-0014). |
| `github_pr_update` | Write, approval-gated. Title, body, base branch, open/closed. |
| `github_pr_assign` | Write, approval-gated. Request reviewers, apply labels. |

### Configuration

| Field | Default | Semantics |
|---|---|---|
| `write` | `true` | Register the write tools. Off = they are absent from the tool catalog entirely. |
| `searchMaxResults` | `8` | Cap on hits per search (search API rate budget is scarce: 30 req/min). |
| `maxComments` | `30` | Cap on returned conversation comments per read. |
| `diffMaxFiles` / `diffMaxPatchChars` | `50` / `60000` | **Tool-owned** diff budgets (ADR-0005): held here, passed to the seam, enforced there. |
| `logMaxLines` / `logMaxChars` | `80` / `8000` | **Tool-owned** CI log budgets, same mechanism. Only ever applied to a log TAIL (ADR-0015). |
| `reviewMaxFiles` / `reviewMaxPatchChars` | `60` / `120000` | **Tool-owned** review-brief budgets. Deliberately their own numbers, not the diff budgets above: a review reads wider than a plain diff read (ADR-0013). |
| `reviewVerdicts` | `false` | Whether `APPROVE` / `REQUEST_CHANGES` exist at all. Off by default (ADR-0014) — see below. |
| `timeoutMs` | `30000` | Cooperative timeout attached to every tool (`dsh-timeout-policy` enforces). |

### Review verdicts are off by default (ADR-0014)

Submitting a review is this suite's first operation with a **social** consequence: `APPROVE` and `REQUEST_CHANGES` go out under the user's own account, read to collaborators as their judgement, and change whether the PR is blocked. Approval-per-call is the wrong last line of defence for that — under approval fatigue, one distracted "yes" is all it takes.

So the capability itself is opt-in. With `reviewVerdicts` off (the default), the event enum contains only `COMMENT`: the model never sees that approving is possible, so it cannot attempt it and be refused. Turning the switch on widens the enum, and each submission still passes the approval waterfall with a reason that names the event and its consequence.

Two things worth knowing:

- GitHub refuses `APPROVE` and `REQUEST_CHANGES` on **your own** pull request. The status bar's [AI review] path is exactly that case, so it can only ever produce `COMMENT` — the provider translates the platform's terse 422 into a sentence saying so.
- The host's `PreToolDecision` carries only a reason string, with no risk level to raise, so the wording of that reason *is* the whole confirmation layer available here.

### Approval flow (writes)

Every write returns `ask` from `tools/pre-execute` with a human-readable reason naming the target repo, title, and a body preview — exactly what the host's ApprovalPanel renders. The registry resolves the ask through the optional approval seam: `allowed-once` proceeds; rejection, cancellation, and an absent approval channel each materialize a distinct model-visible refusal result (never an exception), so the model can explain and continue. Read tools pass the gate untouched.

### Presentation

`presentCall` / `presentResult` are pure and replay-safe: reads render as `read`/`search` cards, writes as `edit` cards; `github_pr_create` presents `created: false` as "PR #N already open". Result meta is narrowed defensively — malformed replay meta falls back to the generic card instead of throwing.

### Errors the model can act on

Seam failures are translated at the tool boundary: rate limits become a wait-and-retry hint carrying `retryAfterMs` (and a nudge toward direct reads over search), auth failures name the fix (connect GitHub / set `GITHUB_TOKEN`), not-found points at the handle. Diff truncation is surfaced with a "narrow the scope" hint.

## Connect service (`dsh-github/connect`)

The **GitHub connect service** (`ctx.githubConnect`): everything between "the user clicks Connect GitHub" and "the status bar above the input knows what to offer". Three responsibilities:

1. **Device Flow authorization** (ADR-0001): `startDeviceFlow()` returns the user code immediately and polls in the background at the server's pace (`authorization_pending` continues, `slow_down` adds 5s, `expired_token` / `access_denied` settle terminally). On success the token lands in the **credentials seam** (`credentials.set`) — its `credentials/reference-updated` event is what refreshes every consumer, no restart, and the token value never transits the frontend. v1 uses non-expiring authorization; the refresh-token gap is documented in the code where it will land.
2. **Deterministic flow-state detection** (ADR-0002): after each `agent/turn-stopping`, cheap git facts (current branch, head sha, ahead count) plus one branch-PR lookup fold into the four-state machine — `hidden` / `pr-ready` / `pr-open` (with CI rollup) / `pr-merged` — pushed over the `github/flow-state` event. Gated hard: non-GitHub remote or unresolvable credential ⇒ no events (unconnected users never see the feature). Turns that produced no new commits emit nothing (noise rule). Detection never throws into the turn.
3. **`@Remote` button methods** (design §6, zero model turns): `connectStatus()` (cached login lookup), `startDeviceFlow()`, `deviceFlowStatus()`, `disconnect()`, `prDraft()` (deterministic title/body prefill from the commits ahead of base), `createPr()` (branch/base from git, PR through the seam's idempotent create), `mergePr()` (squash / merge / rebase; 405/409 map to `GITHUB_MERGE_BLOCKED`), `prChecks()` and `refreshFlowState()` for the badge poller — the FRONTEND owns the polling cadence and stops while the page is hidden.

### Configuration

| Field | Default | Semantics |
|---|---|---|
| `clientId` | the shared `dsh-github-connector` OAuth App | Client id for the Device Flow (a public identifier, not a secret). Override on GHES with an App registered on your instance. |
| `credentialRef` | `GITHUB_TOKEN` | Where the token is stored and resolved (credentials seam, env fallback). |
| `apiBaseURL` / `authBaseURL` | github.com endpoints | GHES: point `apiBaseURL` at `/api/v3`, `authBaseURL` at the GHES host. |
| `host` | `github.com` | The host a workspace remote must point at to activate flow-state. |
| `cwd` / `baseBranch` | calling session’s workspace, else process cwd / remote HEAD | `cwd` forces every git check into one directory (ADR-0010: normally the calling session’s `header.cwd` decides); `baseBranch` overrides the detected base. |
| `scope` | `repo` | OAuth scope requested by the Device Flow. |

### Events (host-internal, ADR-0009)

dsh does not forward custom host events to the browser, so both events below serve host-side consumers only; the web UI polls `refreshFlowState` and `deviceFlowStatus` instead. `deviceFlowStatus()` returns the active flow's latest `DeviceFlowUpdate` (updates from a superseded flow are dropped, so a poller never sees a stale terminal phase).

- `github/flow-state` — the status bar's state (four kinds above).
- `github/device-flow` — `awaiting-authorization` (with the prompt) → `slow-down`* → `authorized` | `expired` | `denied` | `failed`.

## Web UI (`dsh-github/ui`)

The **GitHub workflow UI** for the dsh web client (design §1): two React slot fills, driven entirely by the connect row's `@Remote` methods plus frontend-paced polling (ADR-0009 — dsh forwards no custom host events to the browser; the only forwarded event this UI uses is `credentials/reference-updated`).

1. **"Connect GitHub" page** (mounted as the `settings.plugins.tab` page of the dsh Plugins settings section — Settings → Plugins, ADR-0008): [Connect GitHub] starts the Device Flow — the user code is auto-copied, the authorization page opens, progress arrives by polling `deviceFlowStatus` at the server-dictated interval (stretched on `slow_down`), and a connected user sees `Connected as @login` plus [Disconnect]. The token never transits the frontend.
2. **Conversation PR status bar** (`conversation.input.dock` slot), a compact Claude-Code-style chip hugging the conversation column, the three stages of design §1: `repo feat/x +N −M` + [Create PR] + [×] → `#123 · CI badge` + [AI review] [Merge ▾] (squash / merge commit / rebase / open on GitHub) + [×] → `#123 merged`, collapsing shortly after. Hidden for unconnected users; disappears immediately on disconnect; [×] hides the chip until the flow state changes. [Create PR] hands the whole job to the agent turn via `sessions.prompt` — the model derives the title/description from the session context and creates the PR with its GitHub tools, while the button holds a loading state until the polled state transitions (timeout-capped, ADR-0011); [Merge] calls `@Remote` directly behind the irreversible-action confirmation; [AI review] also spends a turn via `sessions.prompt`.

Both pollers back off exponentially and **stop while the page is hidden**: the CI badge (`prChecks`) and the flow state (`refreshFlowState`, whose unchanged rounds never close an open dropdown, discard a draft, or resurrect a collapsed merged banner) — the risk-table rule that polling must not eat the rate limit.

### Binding (ADR-0007/0008)

This row binds to the web client through two contracts in `src/ui/types.ts`: the **`GitHubUiShell` port** (slot registration, `prompt`, `openExternal`, `copyText`, `confirmIrreversible`, page visibility) and the hand-authored **Typert Remote client face** for the `githubConnect` namespace, replaced by the real generated artifact once the Typert generator runs over the host package. Install everything with one call:

```ts
import { installGitHubUi } from 'dsh-github/ui'

const dispose = installGitHubUi(shellAdapter, typertClientRemote, { locale: 'zh-CN' })
```

### The dsh client half (`dsh-github/client`)

`src/ui/client/` is the shipped implementation of that port for a real dsh web deployment (ADR-0008), packaged in the dsh client-plugin form: the `./client` export plus the `dsh.client` manifest, a node half whose loader row (`ui-github`, applied by `dsh plugin add`) anchors the dsh client-module scan, and `lib/client.js` built as the CJS closure factory the dsh module loader executes (`scripts/build-client.mjs`; only react and cordis stay external). On boot it self-mounts the hand-written `githubConnect` contribution through `ctx.remote.$mount` — no dsh-repo change required — then installs both surfaces over the browser shell adapter: the settings fill lands as the Plugins section's `settings.plugins.tab` page, [AI review] sends through `ctx.sessions.scope(sessionId)` into the session, external links open as http(s)-only new tabs, and the locale follows the page language. The dsh service types it consumes are shimmed in `src/ui/client/shims.ts`, to be deleted on migration into the dsh workspace.

### i18n

Both built-in locales (`en`, `zh-CN`) ship complete catalogs (`catalogFor`); every user-visible string of both slots is paired.

## Testing

Tests stay keyless and per-file 100% covered, one suite per row:

- `dsh-github/rest`: fixture replays through an injected `fetch`; the real-API read-only smoke self-skips without `GITHUB_TOKEN`.
- `dsh-github/tools`: schemas, budget enforcement, approval results, and presentation over a scripted provider.
- `dsh-github/connect`: Device Flow against fully mocked OAuth endpoints; flow-state transitions on fixture git repositories built per test; the credentials write, its announcement, gating, and the no-new-commits noise rule.
- `dsh-github/ui`: component tests under jsdom with a scripted fake remote and shell — all four flow states, the Device Flow walk, backoff-and-pause, the agent-driven create, the dismiss memory, and the client half (contribution codecs, browser shell, plugin apply).

## Model Experience

Indirectly for the transport and the registry, directly for the tool suite. The model sees a small suite of tools with strict schemas; portable `owner/repo` + `number` handles that flow between search hits and reads; lean text renderings tuned for token spend; honest truncation markers with recovery hints; and write refusals phrased as answers. The system prompt section teaches the part-split PR read and the approval semantics up front.

`github_pr_review` is the one tool that hands the model a **task shape** rather than data. Asked to "review this PR", a model left to itself reads the diff and improvises: coverage varies run to run, severity is ad hoc, and findings arrive without a line to point at. The tool replaces that with a brief whose dimensions were **routed deterministically from the change itself** — a docs-only PR is never asked about type design — each carrying a checklist, plus one fixed severity vocabulary and a contract every finding must meet. It ships no verdict and no score: the coverage and the shape are guaranteed, the judgement stays the model's (ADR-0013). The two UI buttons and the connect service exist so that connecting, creating, and merging a PR spend no model turns at all; the [AI review] button is the one that deliberately does.
