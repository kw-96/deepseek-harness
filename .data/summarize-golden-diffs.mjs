/* 汇总每个改动黄金的增删行，过滤已知的 Attach image 按钮行。 */
import { execFileSync } from 'node:child_process'

const stdout = execFileSync('git', ['diff', '--name-only', '--', 'snapshots', 'apps/web/tests/expected'], {
  encoding: 'utf8',
  maxBuffer: 1e8,
})
const files = stdout.trim().split('\n').filter(Boolean)
for (const file of files) {
  const diff = execFileSync('git', ['diff', '--', file], { encoding: 'utf8', maxBuffer: 1e8 })
  const interesting = diff
    .split('\n')
    .filter(line => (line.startsWith('+') || line.startsWith('-')) && !line.startsWith('+++') && !line.startsWith('---'))
    .filter(line => !line.includes('Attach image'))
  if (interesting.length === 0) continue
  console.log(`\n== ${file}`)
  console.log(interesting.join('\n').slice(0, 1200))
}
