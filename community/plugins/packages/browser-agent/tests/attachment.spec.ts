/** 截图附件桥测试：引用必须采用附件库落盘对象的类型，而不是提交时的声明。 */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { createImageSaver } from '../src/host/attachment.js'

/** 附件库对该路由声明的图片限额。 */
const IMAGE_LIMITS = {
  mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  maxImageBytes: 20 * 1024 * 1024,
  maxMessageImageBytes: 200 * 1024 * 1024,
}

/** 附件库返回的落盘引用（测试用的结构化面）。 */
interface StoredRef {
  attachmentId: string
  mediaType: string
  bytes: number
  width: number
  height: number
}

/** 一次提交入参（结构化面）。 */
type SubmitInput = { data: Uint8Array; mediaType: string; name?: string }

/** 造一个已挂附件库、模型能力与智能体服务的宿主上下文。 */
function makeContext(
  store: { saveImage: (input: SubmitInput) => Promise<StoredRef> },
  inputModalities: readonly string[] = ['text', 'image'],
): Context {
  const ctx = new Context()
  ctx.reflect.provide('attachments', { imageLimits: IMAGE_LIMITS, saveImage: store.saveImage })
  ctx.reflect.provide('llm', { resolveModelInfo: async () => ({ inputModalities }) })
  ctx.reflect.provide('agents', {
    get: () => ({
      session: { requestHeader: () => ({ config: { provider: 'codemaker', model: 'deepseek-flash' } }) },
      options: {},
    }),
  })
  return ctx
}

const INPUT = {
  sessionId: 'session-1',
  data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  mediaType: 'image/png' as const,
  name: 'shot.png',
}

describe('截图附件桥', () => {
  it('附件库归一化改编码时，引用采用库返回的类型', async () => {
    // 归一化把不透明大图重编码成 JPEG：若引用仍写提交时的 PNG，之后每一轮重放
    // 都会因落盘对象与引用元数据不符而判 ATTACHMENT_CORRUPT。
    const ctx = makeContext({
      saveImage: async () => ({
        attachmentId: 'att-1',
        mediaType: 'image/jpeg',
        bytes: 15362,
        width: 980,
        height: 534,
      }),
    })
    const save = createImageSaver(ctx)
    await expect(save?.(INPUT)).resolves.toEqual({
      attachmentId: 'att-1',
      mediaType: 'image/jpeg',
      bytes: 15362,
      width: 980,
      height: 534,
      name: 'shot.png',
    })
  })

  it('附件库返回不支持的图片类型时退回路径形态', async () => {
    const ctx = makeContext({
      saveImage: async () => ({
        attachmentId: 'att-2',
        mediaType: 'image/avif',
        bytes: 1,
        width: 1,
        height: 1,
      }),
    })
    const warnings: string[] = []
    ctx.logger.warn = ((message: unknown) => { warnings.push(String(message)) }) as never
    const save = createImageSaver(ctx)
    await expect(save?.(INPUT)).resolves.toBeUndefined()
    expect(warnings.some(message => message.includes('image/avif'))).toBe(true)
  })

  it('该会话路由不声明图像输入时不提交', async () => {
    const saveImage = vi.fn()
    const ctx = makeContext({ saveImage }, ['text'])
    const save = createImageSaver(ctx)
    await expect(save?.(INPUT)).resolves.toBeUndefined()
    expect(saveImage).not.toHaveBeenCalled()
  })

  it('宿主没有附件库时工厂返回 undefined', () => {
    expect(createImageSaver(new Context())).toBeUndefined()
  })
})
