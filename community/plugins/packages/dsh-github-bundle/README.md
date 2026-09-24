# dsh-github-bundle

English | [中文](README.zh.md)

One aggregated bundle entry for the GitHub capability, so the Plugins page lists a single row instead of five.

## What it owns

A bundle patch only: five `insert` rows mounting `dsh-github`, `dsh-github-rest`, `dsh-tool-github`, `dsh-github-connect`, and `dsh-ui-github` together. This package carries no runtime code.

## Why the five packages stay separate

`ctx.github` is a capability seam, and a seam comprises Service Definition, Service Provider, and Consumer roles — split so a provider stays replaceable (a GraphQL or GHES-specific provider can join later) and a consumer stays optional. This package only chooses to mount them as one bundle; it does not merge their code.

Row order carries no load semantics: activation is service-availability driven, so any install order composes the same host.

## Development

```sh
pnpm run typecheck
pnpm run build
```

## License

[MIT](../../LICENSE)
