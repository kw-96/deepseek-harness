import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { OFFICIAL_PACKAGE_INDEX } from '../src/host/official-package-index.js'
import { OFFICIAL_PACKAGE_REGISTRY } from '../src/host/official-package-registry.js'
import { AUTOMATIC_CATEGORIES, declaredGroup, OFFICIAL_CATEGORY, packageDescription, pluginCategory, THIRD_PARTY_CATEGORY } from '../src/host/plugin-category.js'

const tempDirs: string[] = []

function profileWithPackage(packageName: string, manifest: Record<string, unknown>): string {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-plugin-category-'))
  tempDirs.push(directory)
  const packageDir = join(directory, 'node_modules', ...packageName.split('/'))
  mkdirSync(packageDir, { recursive: true })
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: packageName, ...manifest }), 'utf8')
  return directory
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('pluginCategory', () => {
  it('classifies only exact official registry entries as official', () => {
    expect(AUTOMATIC_CATEGORIES).toEqual([OFFICIAL_CATEGORY, THIRD_PARTY_CATEGORY])
    expect(pluginCategory('@deepseek-ai/dsh-session')).toBe(OFFICIAL_CATEGORY)
    expect(pluginCategory('@deepseek-ai/dsh-client-runtime')).toBe(OFFICIAL_CATEGORY)
    expect(pluginCategory('cordis:include')).toBe(OFFICIAL_CATEGORY)
    expect(pluginCategory('dsh-plugin-manager')).toBe(THIRD_PARTY_CATEGORY)
    expect(pluginCategory('dsh-model-manager')).toBe(THIRD_PARTY_CATEGORY)
    expect(pluginCategory('dsh-oauth-newapi')).toBe(THIRD_PARTY_CATEGORY)
    expect(pluginCategory('@community/plugin')).toBe(THIRD_PARTY_CATEGORY)
  })

  it('keeps the checked-in official registry unique and ordered', () => {
    expect(OFFICIAL_PACKAGE_REGISTRY).toContain('@deepseek-ai/dsh-client-runtime')
    expect(new Set(OFFICIAL_PACKAGE_REGISTRY).size).toBe(OFFICIAL_PACKAGE_REGISTRY.length)
    expect(OFFICIAL_PACKAGE_REGISTRY).toEqual([...OFFICIAL_PACKAGE_REGISTRY].sort((left, right) => left.localeCompare(right)))
  })

  it('never reads metadata for official entries: group and description come from the index', () => {
    expect(declaredGroup('@deepseek-ai/dsh-session', '/unused')).toBeNull()
    expect(packageDescription('@deepseek-ai/dsh-session', '/unused')).toBeNull()
  })

  it('reads third-party declared group and description from the hoisted manifest', () => {
    const directory = profileWithPackage('@scope/example', {
      description: 'An example plugin',
      dsh: { pluginManager: { group: 'memory' } },
    })
    expect(declaredGroup('@scope/example', directory)).toBe('memory')
    expect(packageDescription('@scope/example', directory)).toBe('An example plugin')
  })

  it('falls back to null for a missing or invalid third-party manifest', () => {
    const directory = profileWithPackage('unscoped-example', { description: '', dsh: { pluginManager: { group: 'Bad Group!' } } })
    expect(declaredGroup('unscoped-example', directory)).toBeNull()
    expect(packageDescription('unscoped-example', directory)).toBeNull()
    expect(declaredGroup('not-installed', directory)).toBeNull()
  })

  it('keeps the checked-in official index in exact key parity with the registry', () => {
    expect(Object.keys(OFFICIAL_PACKAGE_INDEX).sort()).toEqual([...OFFICIAL_PACKAGE_REGISTRY].sort())
    for (const entry of Object.values(OFFICIAL_PACKAGE_INDEX)) {
      expect(entry.group).toMatch(/^[a-z0-9][a-z0-9._-]{0,63}$/u)
    }
  })
})
