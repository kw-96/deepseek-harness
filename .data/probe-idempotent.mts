/* 幂等性探针：对已归一化输出再次归一化，看路径是否被替换。 */
import { readFileSync } from 'node:fs'
import { normalizeSessionSnapshots } from '../packages/test-support/session-snapshot/src/index.ts'

const cwd = 'C:\\Users\\N33384\\AppData\\Local\\Temp\\dsh-web-e2e-ws-04HTxp\\workspace'
const raw = readFileSync('.data/diag-actual.jsonl', 'utf8')
const out = normalizeSessionSnapshots([raw], { sessionIds: [], cwd })
const index = out[0]!.indexOf('dsh-web-e2e-ws')
console.log('tokenized:', out[0]!.slice(Math.max(0, index - 30), index + 20))
