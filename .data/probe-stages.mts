/* 逐级定位双转义来源。 */
import { readFileSync } from 'node:fs'
import {
  normalizeSessionLog,
  redactSessionSnapshotIds,
  scrubSessionSnapshot,
} from '../packages/test-support/session-snapshot/src/index.ts'

const cwd = 'C:\\Users\\N33384\\AppData\\Local\\Temp\\dsh-web-e2e-ws-04HTxp\\workspace'
const raw = readFileSync('.data/diag-volatiles.jsonl', 'utf8')

const show = (label: string, text: string): void => {
  const i = text.indexOf('dsh-web-e2e-ws')
  const seg = text.slice(Math.max(0, i - 26), i + 8)
  console.log(label, JSON.stringify(seg))
}
show('input      ', raw)
show('redacted   ', redactSessionSnapshotIds([raw])[0]!)
show('scrubbed   ', scrubSessionSnapshot(raw))
show('normalized ', normalizeSessionLog(raw, { sessionIds: [], cwd }))
