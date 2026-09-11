/**
 * 截图附件桥：把截图字节提交到宿主附件库，让工具结果能直接把图给模型看。
 *
 * 只有同时满足「宿主挂了附件库」「字节类型被接受」「不超限额」「该会话当前
 * 模型路由声明支持图像输入」时才提交；任一条件不成立就返回 undefined，
 * 工具结果退回「只给文件路径」的形态。判定失败的默认值一律是「不支持」。
 */

import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { IMAGE_MEDIA_TYPES } from './parse.js'

/**
 * 附件服务的结构化面。
 *
 * 刻意不把 @deepseek-ai/dsh-attachment 声明成依赖：插件只在运行时
 * ctx.get('attachments') 取这个服务，编译期不需要它的类型线；宿主没挂这个
 * 插件时也只是拿不到服务、退回路径形态。
 */
interface AttachmentLike {
  imageLimits: {
    mediaTypes: readonly string[]
    maxImageBytes: number
    maxMessageImageBytes: number
  }
  saveImage(input: { data: Uint8Array; mediaType: string; name?: string }): Promise<{
    attachmentId: unknown
    /**
     * 附件库落盘对象的真实媒体类型。归一化会重编码（不透明大图落到 JPEG），
     * 因此它与提交时声明的类型可能不同，引用必须采用这个值。
     */
    mediaType: string
    bytes: number
    width: number
    height: number
  }>
}

/** 模型能力服务的结构化面。 */
interface LlmLike {
  resolveModelInfo(provider: string, model: string): Promise<{ inputModalities?: readonly string[] }>
}

/** 附件库接受的图片类型。 */
export type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

/** 已提交到宿主附件库的图片引用（结构化面，工具层不依赖宿主类型线）。 */
export interface ImageRefLike {
  attachmentId: string
  mediaType: ImageMediaType
  bytes: number
  width: number
  height: number
  name?: string
}

/** 提交一次截图所需的信息。 */
export interface SaveImageInput {
  /** 归属的 DSH 会话：用于判定该会话的模型路由能否接收图像。 */
  sessionId: string
  data: Uint8Array
  mediaType: ImageMediaType
  name: string
}

/** 一次提交操作。 */
export type ImageSaver = (input: SaveImageInput) => Promise<ImageRefLike | undefined>

/**
 * 判定该会话当前的模型路由是否声明支持图像输入。
 *
 * 未知服务、未知路由或查询失败一律返回 false —— 宁可退回路径形态，也不要让
 * 会话历史里出现文本模型无法回放图像块的一条记录。
 * @param ctx - 宿主上下文
 * @param sessionId - DSH 会话 id
 * @returns 该路由是否支持图像输入
 */
async function isImageRoute(ctx: Context, sessionId: string): Promise<boolean> {
  const llm = ctx.get('llm') as LlmLike | undefined
  const agents = ctx.get('agents')
  if (llm === undefined || agents === undefined) return false
  const agent = agents.get(SessionId(sessionId))
  if (agent === undefined) return false
  const selection = agent.session.requestHeader()?.config
  const provider = selection?.provider ?? agent.options.provider
  const model = selection?.model ?? agent.options.model
  if (provider === undefined || model === undefined) return false
  try {
    const info = await llm.resolveModelInfo(provider, model)
    return info.inputModalities?.includes('image') === true
  } catch (error: unknown) {
    ctx.logger.debug(`browser-agent: 模型能力查询失败，按不支持图像处理：${String(error)}`)
    return false
  }
}

/**
 * 生成截图提交函数；宿主没有附件库时返回 undefined。
 * @param ctx - 宿主上下文
 * @returns 提交函数，或 undefined
 */
export function createImageSaver(ctx: Context): ImageSaver | undefined {
  const attachments = ctx.get('attachments') as AttachmentLike | undefined
  if (attachments === undefined) return undefined
  return async (input) => {
    const limits = attachments.imageLimits
    if (!limits.mediaTypes.includes(input.mediaType)) return undefined
    if (input.data.byteLength > Math.min(limits.maxImageBytes, limits.maxMessageImageBytes)) return undefined
    if (!(await isImageRoute(ctx, input.sessionId))) return undefined
    try {
      const ref = await attachments.saveImage({
        data: input.data,
        mediaType: input.mediaType,
        name: input.name,
      })
      // 类型以附件库返回的为准，不能用提交时的声明：归一化把不透明大图重编码成
      // JPEG，若仍按截图原始的 PNG 写引用，之后每一轮重放都会因为落盘对象与引用
      // 元数据不符而被判 ATTACHMENT_CORRUPT，整个会话从此发不出请求。
      const mediaType = ref.mediaType
      if (!IMAGE_MEDIA_TYPES.includes(mediaType as ImageMediaType)) {
        ctx.logger.warn(`browser-agent: 附件库返回了不支持的图片类型 ${mediaType}，已退回路径形态`)
        return undefined
      }
      return {
        attachmentId: String(ref.attachmentId),
        mediaType: mediaType as ImageMediaType,
        bytes: ref.bytes,
        width: ref.width,
        height: ref.height,
        name: input.name,
      }
    } catch (error: unknown) {
      // 附件库故障不该让截图工具失败：退回只给路径的形态。
      ctx.logger.warn(`browser-agent: 截图提交附件库失败，已退回路径形态：${String(error)}`)
      return undefined
    }
  }
}
