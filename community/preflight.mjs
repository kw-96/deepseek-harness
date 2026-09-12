/**
 * Preflight facts shared by community/seed.mjs and community/doctor.mjs: the
 * runtime versions this deployment requires, the profile bundles that cannot
 * be installed on every host, and the probes that decide it.
 *
 * Identifiers and comments are English; every message a user reads is Chinese.
 */

import { lookup } from 'node:dns'
import { connect } from 'node:net'

/** Node range the harness supports (root package.json `engines.node`). */
export const REQUIRED_NODE_RANGE = '^22.19.0 || >=24.0.0'

/** pnpm version pinned by `packageManager` in the workspace manifests. */
export const REQUIRED_PNPM_VERSION = '11.7.0'

/** Profile bundles that exist only on the NetEase-internal registry. */
export const INTERNAL_BUNDLES = ['ntes-dsh-market', '@dap-dsh-plugins/netease-auth']

/**
 * Profile bundles installed straight from GitHub through a `github:`
 * dependency. They cannot be installed while github.com is unreachable.
 */
export const GITHUB_BUNDLES = ['@dsh-external/dsh-kb-sieve']

/**
 * Profile bundles whose native dependency publishes no binary for some
 * platform/arch pairs. The bundle's JavaScript installs and imports fine, then
 * throws while resolving its native binding, so seeding drops it up front.
 */
export const NATIVE_BUNDLE_LIMITS = [
  {
    name: 'dsh-doc',
    detail: '依赖原生模块 @xberg-io/xberg，该包只发布了 win32-x64 / darwin / linux 二进制，没有 Windows ARM64 版本',
    unsupported: (platform, arch) => platform === 'win32' && arch === 'arm64',
  },
]

/**
 * Whether a Node version satisfies the harness engines range.
 * @param version - a `node --version` string such as `v24.2.0`.
 * @returns true when the major/minor pair is supported.
 */
export function nodeVersionSupported(version) {
  const [major, minor] = String(version).replace(/^v/, '').split('.').map(Number)
  if (!Number.isInteger(major)) return false
  if (major === 22) return (minor ?? 0) >= 19
  return major >= 24
}

/**
 * Probe whether this host can reach a URL. The HTTPS request is the faithful
 * test, but it fails on a host whose local proxy serves the name with a
 * certificate Node's bundled CA store does not trust, so an established TCP
 * connection also counts as reachable. Only a name that answers neither probe
 * is reported unreachable: a false "unreachable" would silently drop a bundle
 * the user wants, while a false "reachable" only produces a loud install error.
 * @param url - absolute URL to request.
 * @param timeoutMs - per-attempt timeout.
 * @returns true when the host answered either probe.
 */
export async function probe(url, timeoutMs = 4000) {
  // Two rounds: a single failed round cannot be told apart from a slow DNS
  // answer or a proxy that dropped the first connection, and reporting a
  // reachable host as unreachable would silently drop a bundle.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
      return true
    } catch {
      if (await tcpReachable(new URL(url), timeoutMs)) return true
    }
  }
  return false
}

/**
 * Open and immediately close a TCP connection to the URL's host and port.
 * Every address the name resolves to is tried, because a host can answer on
 * one (a loopback proxy) while another is blackholed, and reporting the
 * reachable one as unreachable would drop a bundle the user wants.
 * @param url - the parsed URL.
 * @param timeoutMs - how long to wait for each connection.
 * @returns true when any address accepted the connection.
 */
function tcpReachable(url, timeoutMs) {
  const port = Number(url.port) || (url.protocol === 'https:' ? 443 : 80)
  return new Promise((resolve) => {
    lookup(url.hostname, { all: true }, (error, addresses) => {
      if (error || addresses.length === 0) {
        resolve(false)
        return
      }
      let pending = addresses.length
      for (const { address } of addresses) {
        const socket = connect({ host: address, port, timeout: timeoutMs })
        const settle = (reachable) => {
          socket.destroy()
          if (reachable) resolve(true)
          else if (--pending === 0) resolve(false)
        }
        socket.once('connect', () => settle(true))
        socket.once('timeout', () => settle(false))
        socket.once('error', () => settle(false))
      }
    })
  })
}

/**
 * Build the tarball URL a registry serves for one pinned package version.
 * @param registry - registry base URL, with or without a trailing slash.
 * @param name - package name, scoped or plain.
 * @param version - exact version.
 * @returns the tarball URL.
 */
export function tarballUrl(registry, name, version) {
  const base = registry.endsWith('/') ? registry : `${registry}/`
  return `${base}${name}/-/${name.split('/').pop()}-${version}.tgz`
}

/**
 * Whether a registry can still serve one pinned version. A package that was
 * unpublished answers 404. Every other outcome — timeout, 405 for HEAD, a
 * proxy error — counts as available, so an unreachable probe never drops a
 * bundle by accident.
 * @param registry - registry base URL.
 * @param name - package name.
 * @param version - exact version.
 * @param timeoutMs - request timeout.
 * @returns false only when the registry explicitly reports the version gone.
 */
export async function tarballAvailable(registry, name, version, timeoutMs = 8000) {
  try {
    const response = await fetch(tarballUrl(registry, name, version), {
      method: 'HEAD',
      signal: AbortSignal.timeout(timeoutMs),
    })
    return response.status !== 404 && response.status !== 403
  } catch {
    return true
  }
}
