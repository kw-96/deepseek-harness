/* 输出 behavior 类失败的完整信息。 */
import { readFileSync } from 'node:fs'

const report = JSON.parse(readFileSync('.data/web-replay.json', 'utf8'))
const targets = ['chat-scroll-contract', 'hmr-live', 'lifecycle-chrome', 'preview-boot', 'subagent-interrupt-ui']
for (const file of report.testResults) {
  const name = file.name.replace(/\\/g, '/')
  if (!targets.some((target) => name.includes(target))) continue
  for (const assertion of file.assertionResults.filter((a) => a.status === 'failed')) {
    console.log(`\n### ${name.split('/tests/')[1]} :: ${assertion.title}`)
    const message = (assertion.failureMessages[0] ?? '').split('\n')
    console.log(message.slice(0, 46).join('\n'))
  }
}
