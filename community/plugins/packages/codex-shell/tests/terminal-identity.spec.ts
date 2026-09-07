/** Unit coverage for bottom-panel UI / Agent terminal naming. */

import { describe, expect, it } from 'vitest'
import { mintUiTerminalName, terminalOrigin } from '../src/host/terminal-identity.js'

describe('terminal-identity', () => {
  it('marks ui- prefixed names as ui and everything else as agent', () => {
    expect(terminalOrigin('ui-pwsh-1')).toBe('ui')
    expect(terminalOrigin('ui-bash-2')).toBe('ui')
    expect(terminalOrigin('codex-bottom')).toBe('agent')
    expect(terminalOrigin('tool-1')).toBe('agent')
    expect(terminalOrigin(undefined)).toBe('agent')
  })

  it('mints the next unused ui dialect name', () => {
    expect(mintUiTerminalName(new Set(), 'pwsh')).toBe('ui-pwsh-1')
    expect(mintUiTerminalName(new Set(['ui-pwsh-1', 'ui-bash-1']), 'pwsh')).toBe('ui-pwsh-2')
    expect(mintUiTerminalName(new Set(['ui-bash-1', 'ui-bash-2']), 'bash')).toBe('ui-bash-3')
  })
})
