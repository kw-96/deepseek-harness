/* 解析 .data/web-replay.json，按失败类型归类并输出。 */
import { readFileSync } from 'node:fs'

const report = JSON.parse(readFileSync('.data/web-replay.json', 'utf8'))
const failed = report.testResults.filter((file) => file.status === 'failed')

const groups = {
  'golden-aria': [],
  'fixture': [],
  'missing-golden': [],
  'behavior': [],
}
for (const file of failed) {
  const name = file.name.replace(/.*?\\tests\\/, '').replace(/.*?\/tests\//, '')
  for (const assertion of file.assertionResults.filter((a) => a.status === 'failed')) {
    const raw = (assertion.failureMessages[0] ?? '').split('\n').filter((line) => !line.includes('at ') && !line.includes('node:')).slice(0, 12).join(' | ').slice(0, 400)
    let key = 'behavior'
    if (raw.includes('Object.is equality')) key = 'golden-aria'
    else if (raw.includes('persisted replay')) key = 'fixture'
    else if (raw.includes('missing golden')) key = 'missing-golden'
    groups[key].push({ file: name, title: assertion.title, raw })
  }
}
for (const [key, items] of Object.entries(groups)) {
  console.log(`\n=== ${key} (${items.length})`)
  for (const item of items.slice(0, 80)) {
    console.log(`- ${item.file} :: ${item.title.slice(0, 80)}`)
    console.log(`  ${item.raw.slice(0, 360)}`)
  }
}
