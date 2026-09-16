/**
 * browser-panel 冒烟测试：用最小 mock 加载插件的宿主半与浏览器半。
 *
 * 覆盖的是「能否在宿主契约下加载」这一层，而不是联网行为：
 * webServer / tools 被替换成记录器，浏览器半用一个假的 __ModuleLoader__ 接住，
 * 因此不启动 Chrome、不占用端口、不改动任何 profile 状态。
 *
 * 运行：node community/plugins/packages/browser-panel/tests/smoke.mjs
 */
import assert from 'node:assert/strict'

// ── 宿主半 ──────────────────────────────────────────────────────────────────
const routes = []
const tools = []

const ctx = {
  effect(fn) {
    const dispose = fn()
    return () => { if (typeof dispose === 'function') dispose() }
  },
  webServer: {
    register(route) {
      assert.equal(typeof route.kind, 'string', '路由必须声明 kind')
      assert.equal(typeof route.path, 'string', '路由必须有 path')
      assert.equal(typeof route.handler, 'function', '路由必须有 handler')
      routes.push(route)
      return () => {}
    },
  },
  tools: {
    register(definition) {
      tools.push(definition)
      return () => {}
    },
  },
}

const host = await import('../index.js')
assert.equal(host.name, 'dsh-plugin-browser', '插件名必须是 dsh-plugin-browser')
assert.deepEqual(host.inject, ['tools', 'webServer'], '宿主半必须注入 tools 与 webServer')

// autoLaunch 关掉：冒烟测试不拉起真实浏览器。
host.apply(ctx, { port: 9334, autoLaunch: false })

const paths = routes.map((route) => route.path)
for (const required of [
  '/api/preview/state',
  '/api/preview/commands',
  '/api/preview/file',
  '/api/preview/open',
  '/api/preview/proxy',
  '/api/preview/asset',
  '/api/preview/live',
  '/api/preview/browser',
]) {
  assert.ok(paths.includes(required), `路由缺失：${required}`)
}

assert.deepEqual(
  tools.map((tool) => tool.name).sort(),
  ['close_preview', 'open_preview', 'read_preview'],
  '必须注册三个模型可见工具',
)

// ── 浏览器半 ────────────────────────────────────────────────────────────────
let registration = null
globalThis.window = {
  __ModuleLoader__: {
    load(spec) { registration = spec },
  },
}

const reactStub = {
  createElement: () => null,
  useEffect() {},
  useState: (initial) => [initial, () => {}],
  useRef: () => ({ current: null }),
  useCallback: (fn) => fn,
}
const requested = []

await import('../client.js')
assert.ok(registration !== null, 'client.js 必须通过 window.__ModuleLoader__.load 注册自己')
assert.equal(registration.id, 'dsh-plugin-browser', '客户端注册 id 必须与包名一致')

const clientExports = registration.factory((name) => {
  requested.push(name)
  if (name === 'react') return reactStub
  throw new Error(`客户端半请求了未在基线中播种的模块：${name}`)
})
assert.deepEqual(clientExports.inject, ['slots'], '客户端半只依赖 slots 服务')
assert.equal(typeof clientExports.apply, 'function', '客户端半必须导出 apply')

console.log(
  `[smoke] OK｜宿主半：路由 ${routes.length} 条、工具 ${tools.length} 个；`
  + `浏览器半：注册 id=${registration.id}、依赖模块 [${requested.join(', ')}]`,
)
