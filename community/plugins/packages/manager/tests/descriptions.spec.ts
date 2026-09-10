import { describe, expect, it } from 'vitest'
import { PACKAGE_DESCRIPTIONS } from '../src/client/descriptions/index.js'
import { OFFICIAL_PACKAGE_INDEX } from '../src/host/official-package-index.js'

describe('插件说明的简体中文本地化', () => {
  it('官方索引中的每个包都有中文说明', () => {
    const missing = Object.keys(OFFICIAL_PACKAGE_INDEX).filter(name => !PACKAGE_DESCRIPTIONS[name])
    expect(missing).toEqual([])
  })

  it('每条中文说明都非空且有意义', () => {
    for (const [name, description] of Object.entries(PACKAGE_DESCRIPTIONS)) {
      expect(description.trim().length, name).toBeGreaterThan(2)
    }
  })
})
