/* 输出 diag-volatiles 中路径前后 60 个字符的已解码字符串。 */
import { readFileSync } from 'node:fs'

const raw = readFileSync('.data/diag-volatiles.jsonl', 'utf8')
for (const line of raw.split('\n')) {
  if (!line.includes('dsh-web-e2e-ws')) continue
  const record = JSON.parse(line) as Record<string, unknown>
  const text = (record as { data?: { content?: Array<{ text?: string }> } }).data?.content?.[0]?.text
  if (text === undefined) continue
  const i = text.indexOf('dsh-web-e2e-ws')
  console.log(JSON.stringify(text.slice(Math.max(0, i - 40), i + 60)))
  break
}
