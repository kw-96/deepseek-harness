/* 找出含原始工作区名（dsh-web-e2e-ws）的改动黄金文件。 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const stdout = execFileSync('git', ['diff', '--name-only', '--', 'snapshots', 'apps/web/tests/expected'], {
  encoding: 'utf8',
  maxBuffer: 1e8,
})
const files = stdout.trim().split('\n').filter(Boolean)
const hits = []
for (const file of files) {
  const diff = execFileSync('git', ['diff', '--', file], { encoding: 'utf8', maxBuffer: 1e8 })
  if (diff.includes('dsh-web-e2e-ws-')) hits.push(file)
}
console.log(hits.join('\n'))
console.log(`hits: ${hits.length} of ${files.length}`)
writeFileSync('.data/basename-bug-goldens.txt', `${hits.join('\n')}\n`)
