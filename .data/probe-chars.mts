/* 逐字符对比 diag-actual 中的路径拼写与 sessionCwd。 */
import { readFileSync } from 'node:fs'

const cwd = 'C:\\Users\\N33384\\AppData\\Local\\Temp\\dsh-web-e2e-ws-04HTxp\\workspace'
const raw = readFileSync('.data/diag-actual.jsonl', 'utf8')
const needle = 'dsh-web-e2e-ws-04HTxp'
const at = raw.indexOf(needle)
const windowStart = raw.lastIndexOf('"', at - 2) + 1
const windowEnd = raw.indexOf('"', at + needle.length) + 1
const text = raw.slice(windowStart, windowEnd)
console.log('cwd chars  :', [...cwd].map(c => c.codePointAt(0)).join(','))
console.log('text chars :', [...text].map(c => c.codePointAt(0)).join(','))
console.log('equal      :', text === cwd)
console.log('cwd   raw  :', JSON.stringify(cwd))
console.log('text  raw  :', JSON.stringify(text))
