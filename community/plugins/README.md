# DeepSeek Harness Community Plugins

English | [中文](README.zh.md)

Community-maintained plugin sources for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Every package under `packages/` is an installable `dsh` bundle:

- [`dsh-desktop-panel`](packages/desktop-panel) — view and operate the local desktop, including the lock screen, from the browser.
- [`dsh-github`](packages/dsh-github) — the whole GitHub connector in one package: the `ctx.github` capability seam, its REST v3 provider, the model-facing `github_*` tool suite, Device Flow connect, and the web UI, mounted as five host rows through `exports` subpaths (`dsh-github/rest`, `/tools`, `/connect`, `/ui`). Adapted from [kaziii/dsh-github-connector](https://github.com/kaziii/dsh-github-connector) for the 0.1.7 client.
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
