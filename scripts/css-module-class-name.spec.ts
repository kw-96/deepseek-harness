import { describe, expect, it } from 'vitest'
import { cssModuleClassName } from './css-module-class-name.ts'

describe('cssModuleClassName', () => {
  it('returns the hashed name alone when nothing is composed', () => {
    expect(cssModuleClassName({ name: 'a_row', composes: [] })).toBe('a_row')
  })

  it('appends local and global composed class names', () => {
    expect(cssModuleClassName({
      name: 'a_rowCurrent',
      composes: [
        { type: 'local', name: 'a_row' },
        { type: 'global', name: 'theme-dark' },
      ],
    })).toBe('a_rowCurrent a_row theme-dark')
  })

  it('rejects cross-file composes that this bundler cannot resolve', () => {
    expect(() => cssModuleClassName({
      name: 'a_local',
      composes: [{ type: 'dependency', name: 'base', specifier: './other.module.css' }],
    })).toThrow(/unsupported without a CSS bundler/)
  })
})
