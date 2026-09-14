/**
 * 提交信息生成的收敛逻辑：正文与推理共存、只有推理、以及空返回三种形态。
 *
 * 只有推理块是真实发生过的失败——会话默认把推理开在最高档时，推理会占满
 * 输出预算，正文整段缺失。
 */

import { describe, expect, it } from 'vitest'
import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import { readText } from '../src/host/message.js'

/**
 * 用一个流式序列跑一遍拼装。
 * @param chunks 依次推送的块
 * @returns 拼装器
 */
function assemble(chunks: Parameters<BlockAssembler['push']>[0][]): BlockAssembler {
  const assembler = new BlockAssembler()
  for (const chunk of chunks) assembler.push(chunk)
  return assembler
}

describe('提交信息文本收敛', () => {
  it('取出正文文本', () => {
    const assembler = assemble([
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: '整理 Git 面板\n\n- 修正生成' },
      { type: 'block-end', index: 0, block: { type: 'text', text: '整理 Git 面板\n\n- 修正生成' } },
      { type: 'finish', reason: 'stop' },
    ])
    expect(readText(assembler)).toBe('整理 Git 面板\n\n- 修正生成')
  })

  it('推理与正文并存时只取正文', () => {
    const assembler = assemble([
      { type: 'block-start', index: 0, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 0, text: '先看看改了哪些文件……' },
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: '先看看改了哪些文件……' } },
      { type: 'block-start', index: 1, blockType: 'text' },
      { type: 'text-delta', index: 1, text: '整理 Git 面板' },
      { type: 'block-end', index: 1, block: { type: 'text', text: '整理 Git 面板' } },
      { type: 'finish', reason: 'stop' },
    ])
    expect(readText(assembler)).toBe('整理 Git 面板')
  })

  it('只有推理块时报错，并说明实际返回了什么', () => {
    const assembler = assemble([
      { type: 'block-start', index: 0, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 0, text: '想了很久但没写正文' },
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: '想了很久但没写正文' } },
      { type: 'finish', reason: 'length' },
    ])
    // 错误必须点出推理块，否则无法区分「推理吃满预算」与「模型什么都没返回」。
    expect(() => readText(assembler)).toThrow(/reasoning×1/)
  })

  it('完全没有内容块时也说明这一点', () => {
    const assembler = assemble([{ type: 'finish', reason: 'stop' }])
    expect(() => readText(assembler)).toThrow(/没有任何内容块/)
  })
})
