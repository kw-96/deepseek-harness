import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadCodexArchivedThreads } from '../src/archive/read.ts'

let root: string | undefined

afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** 写入一份含消息、工具和 turn 边界的旧 Codex rollout。 */
async function writeArchivedRollout(codexHome: string, sessionId = 'archive-1'): Promise<void> {
  await mkdir(join(codexHome, 'archived_sessions'), { recursive: true })
  const rows = [
    { timestamp: '2026-01-01T00:00:00.000Z', type: 'session_meta', payload: { session_id: sessionId, cwd: 'C:\\archive' } },
    { timestamp: '2026-01-01T00:00:01.000Z', type: 'event_msg', payload: { type: 'task_started', turn_id: 'turn-1', started_at: 1 } },
    { timestamp: '2026-01-01T00:00:02.000Z', type: 'response_item', payload: { type: 'message', id: 'u1', role: 'user', content: [{ type: 'input_text', text: 'archived question' }], internal_chat_message_metadata_passthrough: { turn_id: 'turn-1', create_time: 2 } } },
    { timestamp: '2026-01-01T00:00:03.000Z', type: 'response_item', payload: { type: 'custom_tool_call', id: 'call-item', call_id: 'call-1', name: 'exec', input: '{"command":"git status"}', status: 'completed', internal_chat_message_metadata_passthrough: { turn_id: 'turn-1', create_time: 3 } } },
    { timestamp: '2026-01-01T00:00:04.000Z', type: 'response_item', payload: { type: 'custom_tool_call_output', id: 'out-item', call_id: 'call-1', output: [{ type: 'output_text', text: 'clean' }], internal_chat_message_metadata_passthrough: { turn_id: 'turn-1', create_time: 4 } } },
    { timestamp: '2026-01-01T00:00:05.000Z', type: 'response_item', payload: { type: 'message', id: 'a1', role: 'assistant', content: [{ type: 'output_text', text: 'archived answer' }], internal_chat_message_metadata_passthrough: { turn_id: 'turn-1', create_time: 5 } } },
    { timestamp: '2026-01-01T00:00:06.000Z', type: 'event_msg', payload: { type: 'task_complete', turn_id: 'turn-1', completed_at: 6 } },
  ]
  await writeFile(join(codexHome, 'archived_sessions', `rollout-${sessionId}.jsonl`), `${rows.map(row => JSON.stringify(row)).join('\n')}\n`)
}

describe('loadCodexArchivedThreads', () => {
  it('normalizes archived messages, custom tools, turn boundaries, and cwd', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-codex-archive-'))
    await writeArchivedRollout(root)

    const records = await loadCodexArchivedThreads(root)

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ threadId: 'archive-1', cwd: 'C:\\archive' })
    expect(records[0]?.items.map(item => item.itemType)).toEqual(['userMessage', 'mcpToolCall', 'agentMessage'])
    expect(records[0]?.items[1]?.json).toMatchObject({
      server: 'codex', tool: 'exec', arguments: { command: 'git status' }, result: { content: [{ type: 'output_text', text: 'clean' }] },
    })
    expect(records[0]?.turns).toEqual([{ turnId: 'turn-1', startedAtMs: 1000, completedAtMs: 6000, status: 'completed' }])
  })

  it('keeps only the latest archived rollout for a repeated session id', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-codex-archive-'))
    await writeArchivedRollout(root, 'same')
    await writeFile(join(root, 'archived_sessions', 'rollout-same-later.jsonl'), [
      JSON.stringify({ timestamp: '2026-01-02T00:00:00.000Z', type: 'session_meta', payload: { session_id: 'same', cwd: 'C:\\later' } }),
      JSON.stringify({ timestamp: '2026-01-02T00:00:01.000Z', type: 'response_item', payload: { type: 'message', id: 'u2', role: 'user', content: [{ type: 'input_text', text: 'later' }], internal_chat_message_metadata_passthrough: { turn_id: 'turn-2', create_time: 10 } } }),
      '',
    ].join('\n'))

    const records = await loadCodexArchivedThreads(root)

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ threadId: 'same', cwd: 'C:\\later' })
  })
})
