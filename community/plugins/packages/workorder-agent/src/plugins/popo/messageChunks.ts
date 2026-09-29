const MAX_MESSAGE_BYTES = 4500
const MAX_MESSAGE_CHARACTERS = 2800
const MAX_CHUNK_CONTENT_BYTES = 3400
const MAX_CHUNK_CONTENT_CHARACTERS = 2400
const MAX_ISSUE_LINE_BYTES = 3000
const MAX_ISSUE_LINE_CHARACTERS = 2100
const LINK_PATTERN = /\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)/g

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

function characterLength(value: string): number {
  return [...value].length
}

function fits(value: string, bytes: number, characters: number): boolean {
  return byteLength(value) <= bytes && characterLength(value) <= characters
}

function splitText(value: string, byteLimit: number, characterLimit = MAX_CHUNK_CONTENT_CHARACTERS): string[] {
  const chunks: string[] = []
  let current = ''
  for (const character of value) {
    if (current && !fits(current + character, byteLimit, characterLimit)) {
      chunks.push(current)
      current = ''
    }
    current += character
  }
  if (current) chunks.push(current)
  return chunks
}

function lineParts(line: string): string[] {
  const parts: string[] = []
  let offset = 0
  for (const match of line.matchAll(LINK_PATTERN)) {
    const index = match.index
    if (index > offset) parts.push(...splitText(line.slice(offset, index), MAX_CHUNK_CONTENT_BYTES))
    parts.push(match[0])
    offset = index + match[0].length
  }
  if (offset < line.length) parts.push(...splitText(line.slice(offset), MAX_CHUNK_CONTENT_BYTES))
  return parts
}

function appendPart(chunks: string[], current: string, part: string): string {
  const separator = current ? '\n' : ''
  if (fits(current + separator + part, MAX_CHUNK_CONTENT_BYTES, MAX_CHUNK_CONTENT_CHARACTERS)) {
    return current + separator + part
  }
  if (current) chunks.push(current)
  if (fits(part, MAX_CHUNK_CONTENT_BYTES, MAX_CHUNK_CONTENT_CHARACTERS)) return part
  const pieces = splitText(part, MAX_CHUNK_CONTENT_BYTES)
  chunks.push(...pieces.slice(0, -1))
  return pieces.at(-1) ?? ''
}

function splitIssueLine(line: string): string[] {
  const separator = line.indexOf('：')
  if (separator < 0 || fits(line, MAX_ISSUE_LINE_BYTES, MAX_ISSUE_LINE_CHARACTERS)) return [line]
  const label = line.slice(0, separator + 1)
  const links = line.slice(separator + 1).split('、').filter(Boolean)
  const lines: string[] = []
  let current = label
  for (const link of links) {
    const delimiter = current === label ? '' : '、'
    if (fits(current + delimiter + link, MAX_ISSUE_LINE_BYTES, MAX_ISSUE_LINE_CHARACTERS)) {
      current += delimiter + link
    } else {
      if (current !== label) lines.push(current)
      current = label + link
    }
  }
  if (current !== label) lines.push(current)
  return lines.length ? lines : [line]
}

function inspectionGroups(message: string): { title: string; footer: string; groups: string[][] } | undefined {
  const sections = message.trim().split(/\n\s*\n/)
  const title = sections[0]?.split('\n')[0] ?? ''
  const footer = sections.at(-1) ?? ''
  if (!title.startsWith('【') || !title.endsWith('】') || !footer.startsWith('请相关同学')) return undefined
  const first = sections[0]?.split('\n').slice(1) ?? []
  const middle = sections.slice(1, -1).map((section) => section.split('\n'))
  const groups = first.length ? [first, ...middle] : middle
  if (!groups.length || groups.some((group) => !group[0]?.endsWith('：'))) return undefined
  return { title, footer, groups }
}

function splitInspectionMessage(message: string): string[] | undefined {
  const parsed = inspectionGroups(message)
  if (!parsed) return undefined
  const output: string[] = []
  for (const group of parsed.groups) {
    const assignee = group[0]?.slice(0, -1) ?? '未指派'
    const header = `${parsed.title}\n指派人：${assignee}`
    let current = header
    for (const line of group.slice(1).flatMap(splitIssueLine)) {
      if (fits(`${current}\n${line}\n\n${parsed.footer}`,
        MAX_CHUNK_CONTENT_BYTES, MAX_CHUNK_CONTENT_CHARACTERS)) {
        current += `\n${line}`
      } else {
        output.push(`${current}\n\n${parsed.footer}`)
        current = `${header}\n${line}`
      }
    }
    output.push(`${current}\n\n${parsed.footer}`)
  }
  return output.map((chunk, index) => `【发送进度 ${index + 1}/${output.length}】\n${chunk}`)
}

function splitGenericMessage(message: string): string[] {
  const chunks: string[] = []
  let current = ''
  for (const line of message.split('\n')) {
    if (fits(line, MAX_CHUNK_CONTENT_BYTES, MAX_CHUNK_CONTENT_CHARACTERS)) {
      current = appendPart(chunks, current, line)
    }
    else for (const part of lineParts(line)) current = appendPart(chunks, current, part)
  }
  if (current) chunks.push(current)
  return chunks.map((chunk, index) => `【消息分段 ${index + 1}/${chunks.length}】\n${chunk}`)
}

/**
 * 按 POPO UTF-8 字节限制分段，巡检消息按指派人隔离并重复必要上下文。
 * @param message 完整文本消息
 * @returns 可依次发送的消息分段
 */
export function splitPopoMessage(message: string): string[] {
  if (!message) return []
  if (fits(message, MAX_MESSAGE_BYTES, MAX_MESSAGE_CHARACTERS)) return [message]
  return splitInspectionMessage(message) ?? splitGenericMessage(message)
}
