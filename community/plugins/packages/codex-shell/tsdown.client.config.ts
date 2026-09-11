import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, resolve, sep } from 'node:path'
import { transform } from 'lightningcss'
import { defineConfig } from 'tsdown'
import { cssModuleClassName } from '../../../../scripts/css-module-class-name.ts'

const require = createRequire(import.meta.url)
const id = 'dsh-codex-shell'
const externals = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-api-gateway/client',
  '@deepseek-ai/dsh-api-session-controller/client',
  '@deepseek-ai/dsh-api-workspace-controller/client',
  '@deepseek-ai/dsh-client-connection',
  '@deepseek-ai/dsh-client-locale/client',
  '@deepseek-ai/dsh-client-runtime/client',
  '@deepseek-ai/dsh-client-ui-chat/client',
  '@deepseek-ai/dsh-client-ui-layout/client',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-workspace/client',
  '@deepseek-ai/dsh-typert-protocol',
  'react',
  'react/jsx-runtime',
  // hero 折叠弹层用 createPortal：react-dom 属宿主基线模块，必须外置，
  // 否则会把整份 react-dom 打进插件产物（双 reconciler 与体积翻倍）。
  'react-dom',
]
const cssPrefix = '\0dsh-codex-shell-css:'
const cssPlainPrefix = '\0dsh-codex-shell-css-plain:'
const cssSuffix = '.mjs'

export default defineConfig({
  entry: { client: 'lib/types/client/index.js' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  clean: false,
  dts: false,
  sourcemap: true,
  deps: {
    neverBundle: externals,
    alwaysBundle: [/.*/],
  },
  define: { 'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production') },
  plugins: [{
    name: 'dsh-codex-shell-css',
    resolveId(source: string, importer?: string) {
      if (importer === undefined) return null
      if (source.endsWith('.module.css')) {
        const emitted = resolve(dirname(importer), source)
        const marker = `${sep}lib${sep}types${sep}`
        const boundary = emitted.indexOf(marker)
        const filename = boundary < 0 ? emitted : resolve(emitted.slice(0, boundary), 'src', emitted.slice(boundary + marker.length))
        return cssPrefix + filename + cssSuffix
      }
      if (source.endsWith('.css') || source.includes('/css/xterm.css')) {
        try {
          const filename = require.resolve(source, { paths: [dirname(importer)] })
          return cssPlainPrefix + filename + cssSuffix
        } catch {
          return null
        }
      }
      return null
    },
    async load(virtualId: string) {
      if (virtualId.startsWith(cssPlainPrefix)) {
        const filename = virtualId.slice(cssPlainPrefix.length, -cssSuffix.length)
        this.addWatchFile(filename)
        const css = (await readFile(filename)).toString()
        const tagId = `${id}/${basename(filename)}`
        return [
          `const css = ${JSON.stringify(css)};`,
          `const tagId = ${JSON.stringify(tagId)};`,
          `if (!document.querySelector('style[data-plugin-css="' + tagId + '"]')) {`,
          `  const tag = document.createElement('style'); tag.dataset.plugin = ${JSON.stringify(id)};`,
          `  tag.dataset.pluginCss = tagId; tag.textContent = css; document.head.appendChild(tag);`,
          `}`,
          'export default {};',
        ].join('\n')
      }
      if (!virtualId.startsWith(cssPrefix)) return null
      const filename = virtualId.slice(cssPrefix.length, -cssSuffix.length)
      this.addWatchFile(filename)
      const result = transform({ filename, code: await readFile(filename), cssModules: true, minify: true })
      const classes = Object.fromEntries(
        Object.entries(result.exports ?? {}).map(([key, value]) => [key, cssModuleClassName(value)]),
      )
      const tagId = `${id}/${basename(filename)}`
      return [
        `const css = ${JSON.stringify(result.code.toString())};`,
        `const tagId = ${JSON.stringify(tagId)};`,
        `if (!document.querySelector('style[data-plugin-css="' + tagId + '"]')) {`,
        `  const tag = document.createElement('style'); tag.dataset.plugin = ${JSON.stringify(id)};`,
        `  tag.dataset.pluginCss = tagId; tag.textContent = css; document.head.appendChild(tag);`,
        `}`,
        `export default ${JSON.stringify(classes)};`,
      ].join('\n')
    },
  }],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
