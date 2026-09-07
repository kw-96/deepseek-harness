/** UI vs Agent terminal naming helpers for the bottom panel. */

/** Classify a PTY by its owner-local name prefix. */
export function terminalOrigin(name: string | undefined): 'ui' | 'agent' {
  return name !== undefined && name.startsWith('ui-') ? 'ui' : 'agent'
}

/**
 * Mint the next unused UI tab name for one dialect.
 * @param taken - names already reserved or published for this owner.
 * @param dialect - shell dialect encoded in the name.
 */
export function mintUiTerminalName(
  taken: ReadonlySet<string>,
  dialect: 'bash' | 'pwsh',
): string {
  let index = 1
  while (taken.has(`ui-${dialect}-${index}`)) index += 1
  return `ui-${dialect}-${index}`
}
