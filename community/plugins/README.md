# DeepSeek Harness Community Plugins

English | [中文](README.zh.md)

Community-maintained plugin sources for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Every package under `packages/` is an installable `dsh` bundle:

- [`dsh-desktop-panel`](packages/desktop-panel) — view and operate the local desktop, including the lock screen, from the browser.
- [`dsh-mode-router`](packages/mode-router) — classify each user turn and inject the verification focus as agent context.
- [`dsh-figma-mcp`](packages/figma-mcp) — bring Figma to the model: read designs and image assets over the Figma REST API, and read or write the canvas through a Figma Desktop plugin bridge.
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
