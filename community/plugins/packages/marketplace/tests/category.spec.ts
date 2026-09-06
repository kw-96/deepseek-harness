import { describe, expect, it } from 'vitest'
import { CATEGORY_LABELS, deriveCategory } from '../src/category.js'

describe('marketplace category derivation', () => {
  it('maps specific keyword families to their category', () => {
    expect(deriveCategory(['mcp'])).toBe('mcp')
    expect(deriveCategory(['skill'])).toBe('skill')
    expect(deriveCategory(['plugin-manager'])).toBe('plugin-manager')
    expect(deriveCategory(['memory'])).toBe('memory')
    expect(deriveCategory(['workflow'])).toBe('workflow')
    expect(deriveCategory(['billing'])).toBe('cost')
    expect(deriveCategory(['security'])).toBe('security')
    expect(deriveCategory(['web-ui'])).toBe('ui')
    expect(deriveCategory(['llm'])).toBe('llm')
    expect(deriveCategory(['agent'])).toBe('agent')
    expect(deriveCategory(['cli'])).toBe('tool')
  })

  it('falls back to other for keyword-free or unmapped entries', () => {
    expect(deriveCategory([])).toBe('other')
    expect(deriveCategory(['dsh-plugin', 'deepseek-harness', 'dsh'])).toBe('other')
  })

  it('breaks ties with the specificity priority order', () => {
    expect(deriveCategory(['mcp', 'tool'])).toBe('mcp')
    expect(deriveCategory(['memory', 'agent'])).toBe('memory')
    expect(deriveCategory(['skill', 'agent'])).toBe('skill')
    expect(deriveCategory(['agent', 'tool'])).toBe('agent')
  })

  it('wins by keyword count before the priority tiebreak', () => {
    expect(deriveCategory(['agent', 'agent', 'tool'])).toBe('agent')
    expect(deriveCategory(['workflow', 'memory', 'tool', 'tool'])).toBe('tool')
  })

  it('labels every category in both locales', () => {
    for (const [category, labels] of Object.entries(CATEGORY_LABELS)) {
      expect(labels['zh-CN'].length).toBeGreaterThan(0)
      expect(labels.en.length).toBeGreaterThan(0)
      expect(deriveCategory).toBeDefined()
      void category
    }
  })
})
