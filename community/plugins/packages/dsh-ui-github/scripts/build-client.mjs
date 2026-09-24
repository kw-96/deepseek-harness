/**
 * 把 dsh-ui-github 的 client 面（src/client/index.ts）打包成 DSH 客户端模块
 * 加载器要求的 CJS 闭包工厂格式：`window.__ModuleLoader__.load({ id, factory })`。
 *
 * 说明：
 *  - factory 的 id 必须等于包名，加载器拒绝注册成其他名字的 bundle。
 *  - 只有 DSH web 外壳在运行时提供的平台模块保持 external，其余全部内联。
 *  - 不做压缩，保持闭包工厂可读，与 DSH 的 clientBundle 预设一致。
 *
 * 用法：node scripts/build-client.mjs
 */
import { build } from 'esbuild'

/** DSH web 外壳通过 factory 的 require 提供的模块（见 packages/client/web/src/platform.ts）。 */
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
]

const PACKAGE_NAME = 'dsh-ui-github'

await build({
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2020',
  sourcemap: true,
  minify: false,
  external: PLATFORM_MODULES,
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_NAME)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;`,
  },
  footer: { js: 'return module.exports; } });' },
})

console.log(`已生成 lib/client.js（id=${PACKAGE_NAME}）`)
