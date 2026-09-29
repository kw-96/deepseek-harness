# local-fixes — 从 dev 移出的本地 dsh 本体修复（0.1.7 基线）

这些文件原本在 `dev` 分支上直接改动了 dsh 本体（`packages/`、`scripts/`、根 `tsconfig.client.json`）。为了把 `dev` 收敛成「官方 master + community 目录」的形态，它们已从 dev 移出并**备份在这里**，不再随分支走。

## 来源

- 基线：官方 tag `dsh-v0.1.7-rc.1`（提交 `46a7f68b0922371ce7144b668b90e377d8e799f4`）
- 备份时的 dev：`dev` 分支提交 `cb7fb03fae`（含后续 community 改动）
- `local-fixes.diff`：23 个文件相对上述基线的统一差异（790 行）
- `files/`：这些文件在移出前的**完整内容**，保持仓库内的相对路径

## 每一项解决什么

| 文件 | 作用 | 官方 0.2.0-rc.1 是否已修 |
| --- | --- | --- |
| `packages/session/session-format-v2-to-v3/src/migration.ts` | 允许「surface 先于 step/start」的旧代与 Codex 导入会话迁移（新增 `restoreLegacyStep`），否则抛 `SessionFormatUnsupportedMigrationError` | 未修（仍拒绝） |
| `packages/session/session-format-v0-to-v1/src/payload-validation.ts` | 0.1.2 时代写入的 v0 会话：inbox 消息 id 可选、plugin source 的 summary 可与任意 form 并存 | 未修 |
| `packages/session/session-format-v0-to-v1/src/relationships.ts` | 旧导入会话通过关系校验：tool/call 无前置广告时隐式登记 lifecycle | 未修 |
| `packages/client/connection/src/rpc-host.ts` | `registerRpcChannel` 改用 `owner.get('webServer')` 取全局服务注册表。0.1.5 起 webServer 走动态注入，插件 ctx 属性访问会抛 `cannot get property "webServer" without inject`，导致插件的 `ctx.connection.rpc.handle()` 全部失败 | 未修（仍用 `owner.webServer`）。**已安装的 `dsh-mnemon` 调用 `rpc.handle`** |
| `packages/host/frontend-static/src/index.ts` | 静态资源缓存头：hash 资源发 `immutable`、index 与无 hash 文件发 `no-cache`。缺了它升级/重建后浏览器（含桌面端 Electron）会沿用启发式缓存的旧 index，插件资源整批 404 | 未修（无任何 Cache-Control） |
| `packages/bundle/web-app/src/index.ts` | `resolveLanTrust` 不再把 LAN IPv4 字面量并入 trustedHosts，只信任显式 `--trusted-host`（安全收紧） | 未修（仍是官方宽松行为） |
| `packages/client/ui-chat/src/client/apply.ts` | `openFile` 的 cwd 回退到 `retainedBy.mainView > 0` 的会话 cwd，让对话里点文件能被资源 provider 解析 | 未修 |
| `packages/llm/llm-pi-ai/src/stream.ts` | `classifyPiAiError` 增加两条 TRANSPORT 判定（`upstream_stream_error`、JSON 解析中断） | 未修 |
| `packages/core/agent-loop/src/agent.ts` | `send()` 对缺 id 的 UserMessage 补稳定 id，避免第三方插件注入无 id 的 `user/message` | 未修 |
| `packages/test-support/session-snapshot/src/normalize.ts` | Windows 快照归一化接受 JSON 转义拼写（`C:\\...`） | 未修 |
| `scripts/css-module-class-name.ts` + `packages/client/tsdown.client.ts` + `tsconfig.client.json` | 把 lightningcss 的 `composes` 展开进 className（Client CSS modules 组合类名） | 未修（属本地构建基座） |

## 需要时怎么取回

按文件取回即可，这些改动都不大：

```sh
# 看某一项的改动内容
git apply --stat community/patches/local-fixes/local-fixes.diff

# 直接对照完整文件（files/ 下的路径与仓库一致）
diff -u packages/client/connection/src/rpc-host.ts \
        community/patches/local-fixes/files/packages/client/connection/src/rpc-host.ts
```

注意：`local-fixes.diff` 的基线是 `dsh-v0.1.7-rc.1`。将来分支基线升到 0.2.0 后，补丁上下文可能不再匹配，此时以 `files/` 下的完整内容为准手工移植。

## 移出后的观测点

如果将来出现以下现象，优先回到本目录取回对应修复：

- 打开某个很久以前的会话报 `SessionFormatUnsupportedMigrationError`，或 Codex 导入的会话打不开 → 取回迁移三项
- 某个插件的 Remote 方法/面板不工作、请求 405 → 取回 `rpc-host.ts`
- 升级或重建后插件资源整批加载失败 → 取回 `frontend-static/src/index.ts`
