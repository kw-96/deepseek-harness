/** 网络通道的线上数据形态与共享类型（Remote 描述符与界面共用）。 */

import { z } from 'zod'
import type { HttpsChannel, RemoteInfo, RemoteProtocol, SshChannel } from './host/channel/types.js'

export type { HttpsChannel, RemoteInfo, RemoteProtocol, SshChannel }
/** HTTPS 通道探测结果：TLS 与 HTTP 两层分开，二者都过才算通。 */
export const gitHttpsChannelValue = z.object({
  tlsOk: z.boolean(),
  httpOk: z.boolean(),
  status: z.string().nullable(),
  latencyMs: z.number().nullable(),
  error: z.string().nullable(),
}).readonly()

/** SSH 通道探测结果：两个入口的可达性。 */
export const gitSshChannelValue = z.object({
  port22: z.boolean(),
  port443: z.boolean(),
}).readonly()

/** 网络通道状态：协议、两条通道的探测结果与可执行建议。 */
export const gitChannelStatusValue = z.object({
  protocol: z.union([z.literal('https'), z.literal('ssh'), z.literal('other')]),
  remoteName: z.string().nullable(),
  remoteUrl: z.string().nullable(),
  https: gitHttpsChannelValue,
  ssh: gitSshChannelValue,
  advice: z.union([
    z.literal('ok'), z.literal('use-ssh'), z.literal('no-channel'), z.literal('no-remote'), z.literal('not-repo'),
  ]),
  sshUrl: z.string().nullable(),
  note: z.string(),
}).readonly()

/** 切换远程地址的结果。 */
export const gitSwitchResultValue = z.object({ url: z.string(), detail: z.string() }).readonly()

/** 建议用户执行的下一步。 */
export type ChannelAdvice = 'ok' | 'use-ssh' | 'no-channel' | 'no-remote' | 'not-repo'

/** 网络通道状态。 */
export interface GitChannelStatus {
  protocol: RemoteProtocol
  remoteName: string | null
  remoteUrl: string | null
  https: HttpsChannel
  ssh: SshChannel
  advice: ChannelAdvice
  /** 可直接使用的 SSH 远程地址；无法推导时为 null。 */
  sshUrl: string | null
  note: string
}

/** 切换远程地址的结果。 */
export interface GitSwitchResult { url: string; detail: string }
