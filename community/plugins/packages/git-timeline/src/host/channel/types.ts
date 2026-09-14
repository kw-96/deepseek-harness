/** 网络通道模块的内部形态：探测结果与远程信息。 */

/** 一条 HTTPS 通道的探测结果。 */
export interface HttpsChannel {
  /** 握手是否完成。 */
  tlsOk: boolean
  /** 是否拿到 HTTP 响应首行。 */
  httpOk: boolean
  /** HTTP 状态行；未拿到时为 null。 */
  status: string | null
  /** TLS 握手耗时（毫秒）。 */
  latencyMs: number | null
  /** 失败原因（超时、连接错误等）；成功时为 null。 */
  error: string | null
}

/** 一条 SSH 通道的探测结果。 */
export interface SshChannel {
  /** 22 端口是否可建立 TCP 连接。 */
  port22: boolean
  /** 443 端口（ssh.github.com）是否可建立 TCP 连接。 */
  port443: boolean
}

/** 远程仓库的传输协议。 */
export type RemoteProtocol = 'https' | 'ssh' | 'other'

/** 当前仓库的远程信息。 */
export interface RemoteInfo {
  /** 首个远程名称；没有远程时为 null。 */
  name: string | null
  /** 远程 URL（已隐去可能存在的凭据）。 */
  url: string | null
  /** 传输协议归类。 */
  protocol: RemoteProtocol
}
