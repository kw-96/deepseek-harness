# community — vendored deploy assets

This directory makes the DeepSeek Harness checkout self-contained for
deployment: community plugins, the skills the agent uses, and the web profile
manifest all live here, outside the harness `packages/` pnpm workspace (the
root `pnpm-workspace.yaml` globs `packages/*/*`, `vendor/*`, `apps/*`, and
`website`; `community/` is none of those, so `pnpm install` at the repo root
never tries to build or gate these external packages).

## Layout

```
community/
  plugins/            vendored plugin workspace (source + built tarballs)
    packages/           codex-shell · manager · marketplace
    tarballs/           pinned installable .tgz artifacts
    scripts/            build/pack helpers
  skills/             installed skills, copied to $DSH_HOME/skills at boot
  home/               global home files, copied to $DSH_HOME/ (e.g. AGENTS.md)
  profiles/web/       template for $DSH_HOME/profiles/web (manifest only)
  seed.mjs            idempotent bootstrap, hooked into the repo's `dsh` script
  README.md           this file
```

## Deploy on a fresh host

Just the standard DeepSeek Harness commands:

```sh
git clone <this-repo> && cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

The repo's `dsh` script runs `community/seed.mjs` first. On the first boot it
writes `$DSH_HOME/profiles/web` from `community/profiles/web/` (resolving the
three `file:` deps to this checkout's `community/plugins/tarballs/`), copies
the skills into `$DSH_HOME/skills/`, copies the global home files (the
user-global `AGENTS.md`) into `$DSH_HOME/`, then `pnpm install`s the profile.
After that it is a fast no-op. Override the home with `DSH_HOME=/path`, force a
re-seed with `node community/seed.mjs --force`, or skip the profile install
with `DSH_SEED_SKIP_INSTALL=1`.

## Rebuilding the plugins

`community/plugins/` is an independent pnpm workspace. To rebuild one:

```sh
cd community/plugins
pnpm install
pnpm build            # or pnpm -r run build
pnpm pack:check       # regenerates tarballs under each package's dist/
# copy the .tgz from packages/<pkg>/dist/ into community/plugins/tarballs/
```

## NetEase-internal packages (auto-detected)

`ntes-dsh-market` and `@dap-dsh-plugins/netease-auth` exist only on
`https://npm.nie.netease.com/` (a company-internal registry that also proxies
public npm). `seed.mjs` probes that registry up front:

- **Reachable** → full profile, internal `.npmrc`.
- **Unreachable** → skips those two bundles and dependencies, writes the
  public `registry.npmjs.org` `.npmrc`.

Force a choice instead of auto-detecting:

```sh
node community/seed.mjs --force --internal   # internal registry + packages
node community/seed.mjs --force --public     # public registry, skip internal
```
