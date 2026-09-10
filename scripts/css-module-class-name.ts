/**
 * Map a lightningcss CSS-modules export to the className string applied in JS.
 * `composes` must be included: lightningcss only records composition in the
 * export object and never inlines those class names into the CSS rule.
 *
 * @param exp - One entry from `transform(...).exports`.
 * @returns Space-separated hashed class names (self first, then composed).
 */
export function cssModuleClassName(exp: {
  name: string
  composes: ReadonlyArray<
    | { type: 'local'; name: string }
    | { type: 'global'; name: string }
    | { type: 'dependency'; name: string; specifier: string }
  >
}): string {
  const names = [exp.name]
  for (const ref of exp.composes) {
    if (ref.type === 'dependency') {
      throw new Error(
        `css modules composes from ${JSON.stringify(ref.specifier)} is unsupported without a CSS bundler`,
      )
    }
    names.push(ref.name)
  }
  return names.join(' ')
}
