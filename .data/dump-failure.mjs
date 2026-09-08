/* 提取某个文件的某条失败断言的完整 expected/actual，便于与黄金文件对比。 */
import { readFileSync, writeFileSync } from 'node:fs'

const report = JSON.parse(readFileSync('.data/web-replay.json', 'utf8'))
const [fileFilter, titleFilter] = process.argv.slice(2)
for (const file of report.testResults) {
  const name = file.name.replace(/\\/g, '/')
  if (fileFilter !== undefined && !name.includes(fileFilter)) continue
  for (const assertion of file.assertionResults) {
    if (titleFilter !== undefined && !assertion.title.includes(titleFilter)) continue
    console.log(`### ${name.split('/tests/')[1]} :: ${assertion.title} (${assertion.status})`)
    writeFileSync('.data/last-failure-message.txt', assertion.failureMessages[0] ?? '')
    console.log('full message written to .data/last-failure-message.txt')
  }
}
