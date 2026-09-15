# DeepSeek Harness Plugin Manager

English | [中文](README.zh.md)

This repository contains the community plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): [`dsh-plugin-manager`](packages/manager) hot-loads already installed plugins through Cordis HMR in a running profile and manages their enablement and runtime state.

## Development

```sh
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
pnpm run pack:check
```

Package releases use tags in the form `dsh-plugin-manager@<version>`.

## License

[MIT](LICENSE)
