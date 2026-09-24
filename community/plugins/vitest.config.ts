/** Community 插件的单测入口。
 *
 * 这里刻意**不**用 `vite-tsconfig-paths`：仓库根的 `tsconfig.base.json` 把
 * `@deepseek-ai/dsh-*` 指向主仓 TS 源码，vite 在本环境无法把那些源码转成可执行 JS，
 * 任何经源码路径触及它们的 spec 都会在收集阶段抛 `SyntaxError`。改为让 Node 正常
 * 解析已安装的包（走各包的 `exports` → `lib/`），测试因此不依赖主仓源码的转译能力。
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['community/plugins/packages/*/tests/**/*.spec.{ts,tsx}'],
    environment: 'node',
  },
})