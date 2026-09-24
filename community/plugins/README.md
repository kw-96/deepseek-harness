# DeepSeek Harness Community Plugins

English | [中文](README.zh.md)

Community-maintained plugin sources for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Every package under `packages/` is an installable `dsh` bundle:

- [`dsh-desktop-panel`](packages/desktop-panel) — view and operate the local desktop, including the lock screen, from the browser.
- [`dsh-github`](packages/dsh-github) — the abstract GitHub capability seam (`ctx.github`): provider registry, execution-time resolution, normalized read/write vocabulary, and the `GitHubError` taxonomy. Adapted from [kaziii/dsh-github-connector](https://github.com/kaziii/dsh-github-connector) for the 0.1.7 client.
- [`dsh-github-connect`](packages/dsh-github-connect) — GitHub Device Flow connect, flow-state detection, and the remote button methods.
- [`dsh-github-rest`](packages/dsh-github-rest) — GitHub REST v3 provider: plain fetch (no octokit), per-operation credential resolution, Link-header pagination, and GHES base URL support.
- [`dsh-tool-github`](packages/dsh-tool-github) — the model-facing `github_*` tool suite.
- [`dsh-ui-github`](packages/dsh-ui-github) — GitHub workflow UI: the Connect GitHub settings section and the conversation PR status bar.
- [`dsh-mode-router`](packages/mode-router) — classify each user turn and inject the verification focus as agent context.
- [`workorder-agent`](packages/workorder-agent) — EasyWork workorder inspection, field review, POPO notification, and a control panel.

## Development

```sh
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
pnpm run pack:check
```

Package releases use tags in the form `<package-name>@<version>`.

## License

[MIT](LICENSE)
