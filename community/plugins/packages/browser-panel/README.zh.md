# dsh-plugin-browser（browser-panel，二次开发版）

在 DeepSeek Harness 的 Web 界面里内嵌一个**真实 Chrome**：面板本身就是浏览器——人能看、能点、能输网址；
同时它把这个浏览器的 CDP 端点暴露出来，官方 browser-use 提供方用 `mode: attach` 接进**同一个浏览器**，
于是「人看的面板」与「Agent 操作的浏览器」是同一个进程、同一份登录态。

> 本目录是二次开发版本。上游：[tonyd2wild/DeepSeek-Harness-Browser](https://github.com/tonyd2wild/DeepSeek-Harness-Browser)（MIT）。
> 上游本体在 `README.md` 里保留原文，本文档只记录本仓库的改造与用法。

## 它解决什么

| 场景 | 结果 |
| --- | --- |
| 在 DSH 里访问网页 | 入口在**官方右侧栏**：引导页里的「浏览器」胶囊点开即用；面板由右栏承载，地址栏输网址就能打开，不必切到系统浏览器 |
| 需要登录的站点 | 面板驱动的是独立 profile（默认 `~/.dsh/browser-profile`）里的真 Chrome，登录一次长期保留，且不碰用户日常 Chrome |
| 让 Agent 操作同一个浏览器 | 官方 browser-use 提供方 attach 到同一端点，工具看到的就是你眼前这个页面、这份 Cookie |

## 相对上游的改造

1. **目录重排为社区插件包形态**：上游把插件放在 `plugin/` 子目录（`plugin/package.json`），而社区流程要求
   包根有 `package.json` 且声明 `dsh.bundle.patch`，因此把 `plugin/*` 上提到包根，`examples/` 合并为 `cordis.patch.yml`，
   并删除 clone 带入的内层 `.git` 以便外层仓库跟踪。
2. **依赖修正**：上游把 `@deepseek-ai/dsh-tools` 指向作者机器的 `AppData/Roaming/npm/...` 绝对路径，在别的机器上必然解析失败。
   本版改为 `peerDependencies` 声明契约，由 `dev.mjs` 把本仓库源码包 `packages/core/tools` junction 进社区 workspace 的
   `node_modules`——宿主与插件的 `defineTool` 永远同代。npm 上的同名包可能是另一代，装错会让整个 profile 起不来。
3. **`dsh.client.inject` 修正**：从已不存在的 `@deepseek-ai/dsh-client-runtime` 改为 `@deepseek-ai/dsh-client-ui-slots`
   （浏览器半实际依赖的是 `slots` 服务）。
4. **端口与 profile 目录配置化**：原来是硬编码的 `9334` 与 `~/.dsh/browser-profile`，现在由 `cordis.patch.yml` 的
   `config.port` / `config.userDataDir` 决定；并新增 `config.autoLaunch`，插件加载即拉起浏览器，
   好让 browser-use 的 attach 在会话一开始就有端点可连。
5. **新增只读路由 `GET /api/preview/browser`**：返回 `{ running, endpoint, profileDir, browser }`，
   排查「Agent 连的到底是不是面板里这个浏览器」时直接取，不用猜端口和 profile 目录。
6. **补上 `ctx.effect` 包裹**：官方契约要求每个 slot 贡献都由 effect 持有；上游直接注册，HMR 热替换后会残留旧组件，
   在同一个 `shell.overlay` 上叠出两个面板。
7. **界面文案中文化**（标题、按钮 tooltip、地址栏占位、空态、代理页登录横幅、渲染错误页）。
8. **新增 `tests/smoke.mjs`**：不启动 Chrome、不占端口，即可验证宿主半的 8 条路由与 3 个工具、以及浏览器半的
   `__ModuleLoader__` 注册契约与依赖模块清单。
9. **真实多标签**（本次改动的重点）：面板标签条不再是「面板自己记的网址」，而是**浏览器里的真实标签**——
   包括 Agent 自己开出来的标签。点标签即切换显示对象（同时让宿主把该标签设为浏览器活动标签，否则后台标签
   会被 Chrome 节流渲染、帧流看着像卡住）；`+` 新建真实标签、每个标签可单独关闭。落点是会话层按 target 缓存
   CDP 连接（`sessions: Map<targetId, Session>`），每个标签各有自己的帧流、输入目标与导航历史。
   `live` 前缀路由新增 `targets` / `activate` / `newtab` / `closetab`，其余动作（`stream` / `input` / `state` /
   `text` / `viewport` / `back` / `reload` / `open`）都可带 `target` 指定作用对象。
10. **入口改挂官方右侧栏**：面板不再是 `shell.overlay` 上的浮动卡片，而是用 `ctx.sidebarRightTabs.register(...)`
    注册的右栏标签类型（kind `browser`，并给引导页一枚入口胶囊），正文注册进 `sidebar.right.pane.tab` 席位。
    原来的浮动开关、占位轨道与拖拽手柄一并移除：宽度与轨道归右栏所有，插件那套"改写页面 grid 轨道"的逻辑
    会与右栏布局互相踩，必须停用。

## 多标签下的分工

| 谁 | 在哪个标签 | 结果 |
| --- | --- | --- |
| 你 | 你的标签 | 正常浏览，登录态与 Agent 共享 |
| Agent | 它自己新开的标签（`browser_tabs`） | 在后台干活；面板标签条会出现这个标签，点一下就能旁观 |
| Agent | **你正在看的那个标签** | 会打断你：页面被导航走。用上面的约定即可避免 |

`read_preview` 读的是**面板当前显示的那个标签**：面板切换标签时会把该标签设为浏览器活动标签，宿主再通过
CDP 读它的真实 DOM，所以「人眼前这一页」与「Agent 读到的一页」是一致的。

## 挂载与运行

```sh
# 在仓库根执行：建 junction + 登记进 web profile 的 bundle 列表
node community/plugins/dev.mjs browser-panel
```

之后重启 `dsh web`（bundle 列表在启动时读取），硬刷新页面。入口在右侧栏：点右栏的添加入口，
在引导页里选「浏览器」胶囊，面板就以一个右栏标签的形式打开；也可以在会话里让 Agent 调 `open_preview` 打开网页。

纯 JS 插件没有构建步骤，Host 侧改动由 Cordis HMR 直接热替换；客户端改动需要重建/刷新页面。

## 与官方 browser-use 配合（让 Agent 操作同一个浏览器）

面板默认在 `9334` 端口暴露 CDP 端点。把 web profile 的 `cordis.patch.yml` 里 browser-use 提供方从 launch 改为 attach：

```yaml
{
    id: browser-use-playwright-mcp,
    name: "@deepseek-ai/dsh-experimental-browser-use-playwright-mcp",
    config: { mode: attach, endpoint: "http://127.0.0.1:9334" }
}
```

注意顺序：**先确认面板能起来、`/api/preview/browser` 返回 `running: true`，再切 attach**。
官方提供方在 attach 连接失败时会拒绝会话创建，先切会让「开不了新会话」和「浏览器没起来」绞在一起，难以定位。

attach 是独占的：一个活动 Session 占用连接期间，别的 Session 拿不到它，也不会自动重试。

## 已知限制

- 面板画面在 Web 模式下是 CDP 帧流（不是嵌入的浏览上下文）：`X-Frame-Options` 拒绝内嵌的站点也能正常显示，
  因为根本没有内嵌；但它是「一扇窗」，不是本页面里长出来的浏览器。Electron 壳（`shell/`）才有真正的 `<webview>`，
  本仓库未适配桌面壳。
- 人与 Agent 落在**同一个标签**上时仍会互相导航：Agent 在那个标签导走页面，你填到一半的内容会丢。
  让 Agent 先开新标签即可避免——这也是多标签改造后建议的用法。
- 端口改小之后要同步改 browser-use 的 `endpoint`，两侧必须一致。
- PDF 渲染依赖宿主带 PyMuPDF；缺失时回落到浏览器自带查看器。
- 单文件行数超过本仓库 200 行规范（`client.js` 约 1160 行、`index.js` 约 860 行）。属于引进的存量代码，
  拆分为独立任务，不随本次改造一起做。

## 许可

MIT，见 `LICENSE`（版权归属上游作者）。
