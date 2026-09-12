# community — vendored deploy assets

English | [中文](README.zh.md)

This directory makes the DeepSeek Harness checkout self-contained for deployment: community plugins, the skills the agent uses, and the web profile manifest all live here, outside the harness `packages/` pnpm workspace (the root `pnpm-workspace.yaml` globs `packages/*/*`, `vendor/*`, `apps/*`, and `website`; `community/` is none of those, so `pnpm install` at the repo root never tries to build or gate these external packages).

## Layout

```
community/
  plugins/            vendored plugin workspace (source + built tarballs)
    packages/           codex-left · codex-shell · manager · marketplace
    tarballs/           pinned installable .tgz artifacts
    scripts/            build/pack helpers
  skills/             installed skills, copied to $DSH_HOME/skills at boot
  home/               global home files, copied to $DSH_HOME/ (e.g. AGENTS.md)
  profiles/web/       template for $DSH_HOME/profiles/web (manifest only)
  seed.mjs            idempotent bootstrap, hooked into the repo's `dsh` script
  doctor.mjs          read-only host report; names the command that fixes each problem
  preflight.mjs       runtime versions, per-platform bundle limits, reachability probes
  profile.mjs         profile manifest build and repair
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

The repo's `dsh` script runs `community/seed.mjs` first. On the first boot it writes `$DSH_HOME/profiles/web` from `community/profiles/web/` (resolving the three `file:` deps to this checkout's `community/plugins/tarballs/`), copies the skills into `$DSH_HOME/skills/`, copies the global home files (the user-global `AGENTS.md`) into `$DSH_HOME/`, then `pnpm install`s the profile. Later boots repair only what drifted: tarball paths left by a different checkout, and bundles this host cannot install. Bundles added beyond the template are never removed. Override the home with `DSH_HOME=/path`, rewrite the whole manifest with `node community/seed.mjs --force`, or skip the profile install with `DSH_SEED_SKIP_INSTALL=1`.

## Check the host before deploying

`node community/doctor.mjs` inspects the machine without changing anything, prints one line per check, and names the command that fixes each failure. It covers the Node and pnpm versions, Git, the Windows PowerShell execution policy, the CPU architecture, GitHub and registry reachability, the repository install, and whether the profile still matches this checkout. It exits non-zero when any check fails, so it also works as a preflight step in a script.

## Bundles this host cannot install

`seed.mjs` never writes a profile whose `pnpm install` is guaranteed to fail. It drops each bundle whose dependency cannot be satisfied here and prints the reason:

- **Registry** — a pinned version the chosen registry no longer serves, such as an unpublished package.
- **Network** — a bundle whose dependency is a `github:` reference while github.com is unreachable.
- **Architecture** — a bundle whose native dependency publishes no binary for this platform and CPU.
- **Unsupplied** — a row no dependency declares and no module directory can resolve, such as a row `dsh-plugin-manager` wrote from its catalog without the matching install.

Only a fresh seed weighs the registry and the network, while nothing is installed yet to lose. Repairing an existing profile drops a bundle for the CPU architecture and for an unsupplied row, never on a reachability probe: an installed bundle keeps working offline, and a probe that wrongly reports a host unreachable would delete it. The per-platform table lives in `preflight.mjs`; add a row there when a new bundle gains a native dependency.

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

`ntes-dsh-market` and `@dap-dsh-plugins/netease-auth` exist only on `https://npm.nie.netease.com/` (a company-internal registry that also proxies public npm). `seed.mjs` probes that registry up front:

- **Reachable** → full profile, internal `.npmrc`.
- **Unreachable** → skips those two bundles and dependencies, writes the public `registry.npmjs.org` `.npmrc`.

Force a choice instead of auto-detecting:

```sh
node community/seed.mjs --force --internal   # internal registry + packages
node community/seed.mjs --force --public     # public registry, skip internal
```
