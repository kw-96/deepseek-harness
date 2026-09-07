# Agent Note: Version community tarballs when runtime bytes change

Status: implemented

English | [中文](2026-09-07-community-tarball-versioning.zh.md)

## Problem

The Web profile installs `dsh-codex-shell` from a local `file:` tarball. pnpm records that archive's integrity in the profile lockfile, so replacing bytes at an existing version can leave an installed profile loading an earlier client bundle even when the checkout and manifest name the replacement archive.

## Decision

Each `dsh-codex-shell` runtime release uses a unique semantic version and tarball filename. The Web profile points to that exact archive, and the package README installs the same version. A panel change is released only after the package build and packed `lib/client.js` contain the intended client module; source files, declaration output, and source maps do not substitute for that runtime check.

## Alternatives considered

**Replace the existing tarball without a version bump.** Rejected because installed profiles keep the lockfile integrity and can continue loading earlier bytes under the same package version.

**Force-reseed every existing profile.** Rejected because it depends on every machine receiving a local repair and does not give the changed artifact a distinct dependency identity.

**Install the plugin from the source directory.** Rejected because the Web profile is designed to consume pinned portable archives from `community/plugins/tarballs/`.

## Consequences

Every changed client bundle adds a versioned archive and updates the profile dependency before installation. Existing profiles install the new dependency and restart the `web` profile. This local-archive rule complements the registry integrity rule in [Private npm publication as three independent sequences](2026-08-10-npm-release-sequences.md); no active Agent Note is fully superseded.
