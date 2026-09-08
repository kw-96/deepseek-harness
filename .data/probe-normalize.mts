/* 最小样例验证 normalizeSessionSnapshots 对 cwd 的归一化。 */
import { normalizeSessionSnapshots } from '../packages/test-support/session-snapshot/src/index.ts'

const cwd = 'C:\\Users\\N33384\\AppData\\Local\\Temp\\dsh-web-e2e-ws-Yud0Im\\workspace'
const text = `session workspace: "${cwd}". Some platform temporary areas may also be writable.`
const header = JSON.stringify({ type: 'session', version: 0, id: '{{session:1}}', createdAt: 1, cwd, agentPreset: 'standard' })
const line = JSON.stringify({ type: 'user/message', data: { content: [{ type: 'text', text }] } })
console.log('input header:', header.slice(0, 200))
console.log('input line:', line.slice(0, 160))
const out = normalizeSessionSnapshots([`${header}\n${line}\n`], { sessionIds: [], cwd })
console.log('output line:', out[0]?.slice(0, 320))
