/**
 * The connection list: which harnesses this shell can point at.
 *
 * Deliberately a plain JSON file in the user's home rather than app state, so
 * it can be read, edited and version-controlled by hand. The shell is a viewer;
 * where it points is the user's business, not the app's.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const DIR = path.join(homedir(), '.dsh-shell')
const FILE = path.join(DIR, 'connections.json')

/**
 * A first-run file that works immediately and shows the shape of the thing.
 *
 * Only one entry, pointing at a local harness, because that is the setup
 * everybody has. Remote entries are the user's to add -- see `preConnect`.
 */
const DEFAULTS = {
  active: 'local',
  connections: [
    {
      id: 'local',
      name: 'Local',
      url: 'http://127.0.0.1:3080',
      local: true,
    },
  ],
  /* Reference, written once so the format is discoverable without the docs:
   *
   * {
   *   "id": "workstation",
   *   "name": "Workstation",
   *   "url": "http://127.0.0.1:3081",
   *   "preConnect": "ssh -N -L 3081:127.0.0.1:3080 me@100.64.0.1"
   * }
   *
   * `preConnect` runs before connecting and is killed on disconnect. The shell
   * knows nothing about SSH -- it just runs the command and waits for `url` to
   * answer, so a tunnel, a VPN script or a port-forward all work the same way.
   */
}

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true })
}

/** Load the list, repairing anything malformed rather than refusing to start. */
export function load() {
  try {
    ensureDir()
    if (!existsSync(FILE)) {
      writeFileSync(FILE, JSON.stringify(DEFAULTS, null, 2) + '\n', 'utf8')
      return structuredClone(DEFAULTS)
    }
    const raw = JSON.parse(readFileSync(FILE, 'utf8'))
    const list = Array.isArray(raw?.connections) ? raw.connections : []
    const clean = list
      .filter((c) => c && typeof c.url === 'string' && c.url.trim())
      .map((c, i) => ({
        id: String(c.id || `conn-${i}`),
        name: String(c.name || c.url),
        url: String(c.url).trim(),
        preConnect: typeof c.preConnect === 'string' && c.preConnect.trim() ? c.preConnect.trim() : null,
        local: !!c.local,
      }))
    // A file edited down to nothing should not leave the shell with nowhere to
    // go, so fall back rather than presenting an empty picker.
    if (!clean.length) return structuredClone(DEFAULTS)
    const active = clean.some((c) => c.id === raw.active) ? raw.active : clean[0].id
    return { active, connections: clean }
  } catch {
    return structuredClone(DEFAULTS)
  }
}

/** Remember which one is current, so the shell reopens where it left off. */
export function saveActive(id) {
  try {
    ensureDir()
    const cur = load()
    cur.active = id
    writeFileSync(FILE, JSON.stringify(cur, null, 2) + '\n', 'utf8')
  } catch {
    // A read-only home should not stop the shell working for this session.
  }
}

export const configPath = FILE
