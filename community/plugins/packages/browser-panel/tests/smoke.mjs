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

// 会话层：多标签能力必须在宿主侧成立，面板才可能列出真实标签。
const live = await import('../cdpbrowser.js')
for (const fn of [
  'configure', 'ensureBrowser', 'listTargets', 'createTarget', 'closeTarget',
  'activateTarget', 'browserStatus', 'profilePath', 'startScreencast', 'navigate',
]) {
  assert.equal(typeof live[fn], 'function', `cdpbrowser 必须导出 ${fn}`)
}
const applied = live.configure({ port: 19334 })
assert.equal(applied.port, 19334, 'configure 必须接受端口覆盖')
assert.equal(typeof applied.profileDir, 'string', 'configure 必须返回 profile 目录')

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
assert.deepEqual(clientExports.inject, ['slots', 'sidebarRightTabs'], '客户端半依赖插槽系统与右栏标签注册表')
assert.equal(typeof clientExports.apply, 'function', '客户端半必须导出 apply')

// 真正跑一遍客户端 apply：浏览器入口必须落在官方右侧栏，而不是浮层。
const clientRegistrations = { types: [], seats: [] }
const clientCtx = {
  effect(fn) { const dispose = fn(); return () => { if (typeof dispose === 'function') dispose() } },
  sidebarRightTabs: {
    register(definition) { clientRegistrations.types.push(definition); return () => {} },
  },
  slots: {
    inject(name, contribute) { clientRegistrations.seats.push(`inject:${name}`); return contribute() },
    register(spec) { clientRegistrations.seats.push(`register:${spec.name}:${spec.key ?? spec.id}`); return () => {} },
  },
}
clientExports.apply(clientCtx)

assert.equal(clientRegistrations.types.length, 1, '必须注册且只注册一个右栏标签类型')
assert.equal(clientRegistrations.types[0].kind, 'browser', '标签 kind 必须是 browser')
assert.ok(
  Array.isArray(clientRegistrations.types[0].guide) && clientRegistrations.types[0].guide.length > 0,
  '必须给右栏引导页一枚入口胶囊（这就是浏览器入口）',
)
assert.equal(clientRegistrations.types[0].title(''), '浏览器', '标签标题必须是中文')
assert.ok(
  clientRegistrations.seats.includes('register:sidebar.right.pane.tab:dsh-plugin-browser'),
  '面板正文必须注册进右栏标签正文席位',
)

console.log(
  `[smoke] OK｜宿主半：路由 ${routes.length} 条、工具 ${tools.length} 个；`
  + `浏览器半：注册 id=${registration.id}、依赖模块 [${requested.join(', ')}]；`
  + `右栏：类型 kind=${clientRegistrations.types[0].kind}、引导入口 ${clientRegistrations.types[0].guide.length} 个、正文席位已注册`,
)
