import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { convertCodexThread } from '../src/convert.ts'
import type { CodexThreadRecord, ImportBounds } from '../src/types.ts'

const BOUNDS: ImportBounds = { maxToolResultChars: 50, maxTitleChars: 40 }

/** A two-turn record exercising every mapped item type plus skipped ones. */
function fixture(): CodexThreadRecord {
  return {
    threadId: 'thread-1',
    title: '  整理 校验\n\n表  ',
    items: [
      { turnId: 'turn-a', itemId: 'u1', itemType: 'userMessage', createdAtMs: 1000, json: { type: 'userMessage', content: [{ type: 'text', text: 'hello codex' }] } },
      { turnId: 'turn-a', itemId: 'a1', itemType: 'agentMessage', createdAtMs: 2000, json: { type: 'agentMessage', text: 'hi there' } },
      { turnId: 'turn-a', itemId: 'c1', itemType: 'commandExecution', createdAtMs: 3000, json: { type: 'commandExecution', command: 'git status', cwd: 'C:\\work', status: 'completed', aggregatedOutput: 'branch main\nclean' } },
      { turnId: 'turn-a', itemId: 'a2', itemType: 'agentMessage', createdAtMs: 4000, json: { type: 'agentMessage', text: 'done' } },
      { turnId: 'turn-b', itemId: 'u2', itemType: 'userMessage', createdAtMs: 6000, json: { type: 'userMessage', content: [{ type: 'text', text: 'second question' }] } },
      { turnId: 'turn-b', itemId: 'r1', itemType: 'reasoning', createdAtMs: 7000, json: { type: 'reasoning', content: ['thinking'] } },
      { turnId: 'turn-b', itemId: 'm1', itemType: 'mcpToolCall', createdAtMs: 8000, json: { type: 'mcpToolCall', server: 'srv', tool: 'tool', status: 'completed', arguments: { a: 1 }, result: { content: [{ type: 'text', text: 'tool output' }] } } },
      { turnId: 'turn-b', itemId: 'w1', itemType: 'webSearch', createdAtMs: 8100, json: { type: 'webSearch', query: 'codex', results: [{ title: 'one' }] } },
      { turnId: 'turn-b', itemId: 'f1', itemType: 'fileChange', createdAtMs: 8200, json: { type: 'fileChange', changes: [{ path: 'C:\\work\\a.ts', kind: { type: 'add' } }, { path: 'C:\\work\\b.ts', kind: { type: 'edit' } }] } },
      { turnId: 'turn-b', itemId: 'i1', itemType: 'imageView', createdAtMs: 8300, json: { type: 'imageView', path: 'C:\\work\\shot.png' } },
      { turnId: 'turn-b', itemId: 'x1', itemType: 'futureType', createdAtMs: 8400, json: { type: 'futureType' } },
    ],
    turns: [
      { turnId: 'turn-b', startedAtMs: 6000, completedAtMs: 9000, status: 'cancelled' },
      { turnId: 'turn-a', startedAtMs: 1000, completedAtMs: 5000, status: 'completed' },
    ],
  }
}

function typesOf(events: readonly SessionEvent[]): string[] {
  return events.map(event => event.type)
}

describe('convertCodexThread', () => {
  it('maps messages, tools, and turn boundaries into contiguous DSH events', () => {
    const { events, cwd } = convertCodexThread(fixture(), 'C:\\fallback', BOUNDS)
    expect(cwd).toBe('C:\\work')
    expect(typesOf(events)).toEqual([
      'turn/start', 'user/message', 'session/title', 'assistant/message',
      'tool/call', 'tool/result', 'assistant/message', 'turn/end',
      'turn/start', 'user/message', 'tool/call', 'tool/result',
      'tool/call', 'tool/result', 'tool/call', 'tool/result',
      'tool/call', 'tool/result', 'turn/end', 'session/end-seed',
    ])
    expect(events.map(event => event.seq)).toEqual(events.map((_, index) => index))
    expect(events.every(event => event.time >= (events[event.seq - 1]?.time ?? 0))).toBe(true)
  })

  it('marks only surface events with the append surfaceOp', () => {
    const { events } = convertCodexThread(fixture(), 'C:\\fallback', BOUNDS)
    for (const event of events) {
      if (event.type === 'user/message' || event.type === 'assistant/message' || event.type === 'tool/result') {
        expect(event.surfaceOp).toBe('append')
      } else {
        expect('surfaceOp' in event).toBe(false)
      }
    }
  })

  it('emits the normalized title after the first user message', () => {
    const { events } = convertCodexThread(fixture(), 'C:\\fallback', BOUNDS)
    const user = events.find(event => event.type === 'user/message')
    const title = events.find(event => event.type === 'session/title')
    if (user === undefined || title === undefined) throw new Error('missing user or title event')
    expect(title.seq).toBe(user.seq + 1)
    expect(title.data).toEqual({
      title: '整理 校验 表',
      messageSeqs: [user.seq],
      source: { kind: 'fallback' },
    })
  })

  it('pairs tool calls with results and caps result text', () => {
    const { events } = convertCodexThread({
      ...fixture(),
      items: [{
        turnId: 'turn-a', itemId: 'c1', itemType: 'commandExecution', createdAtMs: 1000,
        json: { type: 'commandExecution', command: 'cat big', status: 'failed', aggregatedOutput: 'x'.repeat(200) },
      }],
      turns: [{ turnId: 'turn-a', status: 'cancelled' }],
    }, 'C:\\fallback', BOUNDS)
    const call = events.find(event => event.type === 'tool/call')
    const result = events.find(event => event.type === 'tool/result')
    if (call === undefined || result === undefined) throw new Error('missing tool pair')
    expect(call.data).toMatchObject({ turn: 1, step: 1, callId: 'c1', name: 'Bash', arguments: '{"command":"cat big"}' })
    if (result.type !== 'tool/result') throw new Error('bad result type')
    expect(result.data.turn).toBe(1)
    expect(result.data.step).toBe(1)
    expect(result.data.message.source).toEqual({ kind: 'tool', callId: 'c1' })
    const block = result.data.message.content[0]
    if (block === undefined || block.type !== 'tool-result') throw new Error('missing tool-result block')
    expect(block.toolCallId).toBe('c1')
    expect(block.isError).toBe(true)
    expect((block.content[0] as { type: 'text'; text: string }).text).toBe('x'.repeat(50))
  })

  it('numbers steps per turn and closes non-completed turns as aborted', () => {
    const { events } = convertCodexThread(fixture(), 'C:\\fallback', BOUNDS)
    const assistant = events.filter(event => event.type === 'assistant/message')
    expect(assistant.map(event => event.data.step)).toEqual([1, 2])
    const endings = events.filter(event => event.type === 'turn/end')
    expect(endings.map(event => event.data.reason)).toEqual([
      { kind: 'completed' },
      { kind: 'aborted', reason: { kind: 'legacy' } },
    ])
  })

  it('uses the fallback cwd when no command carries one', () => {
    const { cwd } = convertCodexThread({
      threadId: 'thread-2',
      items: [{ turnId: 'turn-a', itemId: 'u1', itemType: 'userMessage', createdAtMs: 1, json: { content: [{ type: 'text', text: 'hi' }] } }],
      turns: [],
    }, 'C:\\fallback', BOUNDS)
    expect(cwd).toBe('C:\\fallback')
  })

  it('returns no events for a thread with only non-transcript items', () => {
    const { events } = convertCodexThread({
      threadId: 'thread-3',
      items: [{ turnId: 'turn-a', itemId: 'r1', itemType: 'reasoning', createdAtMs: 1, json: {} }],
      turns: [],
    }, 'C:\\fallback', BOUNDS)
    expect(events).toEqual([])
  })

  it('skips empty user text and unsupported items without breaking turn flow', () => {
    const { events } = convertCodexThread({
      threadId: 'thread-4',
      items: [
        { turnId: 'turn-a', itemId: 'u1', itemType: 'userMessage', createdAtMs: 1, json: { content: [{ type: 'text', text: '   ' }] } },
        { turnId: 'turn-a', itemId: 'a1', itemType: 'agentMessage', createdAtMs: 2, json: { text: 'only' } },
      ],
      turns: [{ turnId: 'turn-a', status: 'completed', startedAtMs: 1, completedAtMs: 3 }],
    }, 'C:\\fallback', BOUNDS)
    expect(typesOf(events)).toEqual(['turn/start', 'assistant/message', 'turn/end', 'session/end-seed'])
    expect(events.find(event => event.type === 'session/title')).toBeUndefined()
  })

  it('folds messy user content, a second user message, and missing turn stamps', () => {
    const { events } = convertCodexThread({
      threadId: 'thread-5',
      items: [
        { turnId: 'turn-a', itemId: 'a1', itemType: 'agentMessage', createdAtMs: 1, json: { text: 'visible' } },
        { turnId: 'turn-a', itemId: 'u1', itemType: 'userMessage', createdAtMs: 2, json: { content: [{ type: 'text', text: 'one' }, { type: 'image' }, null, { type: 'text' }, { type: 'text', text: 'two' }] } },
        { turnId: 'turn-a', itemId: 'u2', itemType: 'userMessage', createdAtMs: 3, json: { content: 'not-an-array' } },
        { turnId: 'turn-a', itemId: 'u3', itemType: 'userMessage', createdAtMs: 4, json: { content: [{ type: 'text', text: 'three' }] } },
        { turnId: 'turn-a', itemId: 'a2', itemType: 'agentMessage', createdAtMs: 5, json: { text: undefined } },
      ],
      turns: [{ turnId: 'turn-a', status: 'completed', completedAtMs: 6 }],
    }, 'C:\\fallback', BOUNDS)
    expect(typesOf(events)).toEqual(['turn/start', 'assistant/message', 'user/message', 'user/message', 'turn/end', 'session/end-seed'])
    if (events[2] === undefined || events[2].type !== 'user/message') throw new Error('missing joined user message')
    expect(events[2].data.content[0]).toEqual({ type: 'text', text: 'one\ntwo' })
    // No title: the thread carries none.
    expect(events.find(event => event.type === 'session/title')).toBeUndefined()
  })

  it('handles sparse tool items without crashing', () => {
    const { events } = convertCodexThread({
      threadId: 'thread-6',
      title: '   ',
      items: [
        { turnId: 'turn-a', itemId: 'u1', itemType: 'userMessage', createdAtMs: 1, json: { content: [{ type: 'text', text: 'sparse' }] } },
        { turnId: 'turn-a', itemId: 'c1', itemType: 'commandExecution', createdAtMs: 2, json: { status: 'completed' } },
        { turnId: 'turn-a', itemId: 'm1', itemType: 'mcpToolCall', createdAtMs: 3, json: { status: 'completed' } },
        { turnId: 'turn-a', itemId: 'm2', itemType: 'mcpToolCall', createdAtMs: 4, json: { server: 's', tool: 't', status: 'completed', result: { content: 'raw' } } },
        { turnId: 'turn-a', itemId: 'w1', itemType: 'webSearch', createdAtMs: 5, json: {} },
        { turnId: 'turn-a', itemId: 'w2', itemType: 'webSearch', createdAtMs: 6, json: { results: null } },
        { turnId: 'turn-a', itemId: 'w3', itemType: 'webSearch', createdAtMs: 7, json: { results: [null, { url: 'u' }, {}] } },
        { turnId: 'turn-a', itemId: 'f1', itemType: 'fileChange', createdAtMs: 8, json: {} },
        { turnId: 'turn-a', itemId: 'f2', itemType: 'fileChange', createdAtMs: 9, json: { changes: [null, { path: 'p' }, { kind: { type: 'x' } }, { path: 'q', kind: {} }, { path: 'r', kind: { type: 'edit' } }] } },
        { turnId: 'turn-a', itemId: 'i1', itemType: 'imageView', createdAtMs: 10, json: {} },
      ],
      turns: [{ turnId: 'turn-a', status: 'completed', startedAtMs: 1, completedAtMs: 11 }],
    }, 'C:\\fallback', BOUNDS)
    expect(typesOf(events).filter(type => type === 'tool/call' || type === 'tool/result')).toHaveLength(18)
    expect(events.find(event => event.type === 'session/title')).toBeUndefined()
    const names: string[] = []
    let webText: string | undefined
    let fileText: string | undefined
    for (const event of events) {
      if (event.type === 'tool/call') names.push(event.data.name)
      if (event.type !== 'tool/result') continue
      const block = event.data.message.content[0]
      if (block === undefined || block.type !== 'tool-result') continue
      const first = block.content[0]
      const text = first !== undefined && first.type === 'text' ? first.text : undefined
      if (text === 'u') webText = text
      if (text === 'changed 3 file(s): p, q, r') fileText = text
    }
    expect(names).toEqual([
      'Bash', 'mcp..', 'mcp.s.t', 'web_search', 'web_search', 'web_search',
      'codex.fileChange', 'codex.fileChange', 'codex.imageView',
    ])
    expect(webText).toBe('u')
    expect(fileText).toBe('changed 3 file(s): p, q, r')
  })

  it('orders turns by start time and breaks cwd ties in first-seen order', () => {
    const { events, cwd } = convertCodexThread({
      threadId: 'thread-7',
      items: [
        { turnId: 'late', itemId: 'u1', itemType: 'userMessage', createdAtMs: 100, json: { content: [{ type: 'text', text: 'late' }] } },
        { turnId: 'late', itemId: 'c1', itemType: 'commandExecution', createdAtMs: 101, json: { command: 'a', cwd: 'C:\\a', status: 'completed' } },
        { turnId: 'early', itemId: 'u2', itemType: 'userMessage', createdAtMs: 1, json: { content: [{ type: 'text', text: 'early' }] } },
        { turnId: 'early', itemId: 'c2', itemType: 'commandExecution', createdAtMs: 2, json: { command: 'a', cwd: 'C:\\a', status: 'completed' } },
        { turnId: 'early', itemId: 'c3', itemType: 'mcpToolCall', createdAtMs: 3, json: { cwd: 'C:\\b', status: 'completed' } },
        { turnId: 'early', itemId: 'c4', itemType: 'commandExecution', createdAtMs: 4, json: { command: 'a', cwd: 'C:\\b', status: 'completed' } },
      ],
      turns: [
        { turnId: 'late', status: 'completed', completedAtMs: 200 },
        { turnId: 'early', status: 'completed', completedAtMs: 2 },
      ],
    }, 'C:\\fallback', BOUNDS)
    const texts: string[] = []
    const turnNumbers: number[] = []
    for (const event of events) {
      if (event.type === 'user/message') {
        const first = event.data.content[0]
        texts.push(first !== undefined && first.type === 'text' ? first.text : '')
      }
      if (event.type === 'turn/start') turnNumbers.push(event.data.turn)
    }
    expect(texts).toEqual(['early', 'late'])
    expect(turnNumbers).toEqual([1, 2])
    expect(cwd).toBe('C:\\a')
  })
})
