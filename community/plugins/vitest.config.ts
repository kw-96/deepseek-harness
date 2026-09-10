/** Community 插件的 UI 单测入口。 */
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export default defineConfig({
  plugins: [tsconfigPaths({ projects: [resolve(repoRoot, 'tsconfig.base.json')] })],
  test: {
    include: ['community/plugins/packages/*/tests/**/*.spec.{ts,tsx}'],
    environment: 'node',
  },
})
