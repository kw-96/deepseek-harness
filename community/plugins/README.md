# DeepSeek Harness Community Plugins

English | [中文](README.zh.md)

Community-maintained plugin sources for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Every package under `packages/` is an installable `dsh` bundle:

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
