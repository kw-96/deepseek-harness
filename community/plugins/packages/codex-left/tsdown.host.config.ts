import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['lib/types/index.js', 'lib/types/types.js', 'lib/types/remote.js'],
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  clean: false,
  dts: false,
  // zod 是 Host 运行时依赖，必须留在包外：内联会把它复制进宿主进程，
  // 并与其它插件各自携带的实例分叉。外置后三个入口不再共享待分割模块，
  // 产物就是 files 清单里的 index.js / remote.js / types.js 三个文件。
  deps: { neverBundle: ['zod'] },
})
