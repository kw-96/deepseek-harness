/** 网络通道模块的对外入口。 */

export { readSshHint } from './conf.js'
export type { SshConfigHint } from './conf.js'
export { probeGitHttps, probeHttps, probeSsh } from './probe.js'
export { classifyRemote, maskRemoteUrl, readRemote, switchRemote, toHttpsUrl, toSshUrl } from './remote.js'
export { buildChannelStatus, decideAdvice } from './status.js'
export type { HttpsChannel, RemoteInfo, RemoteProtocol, SshChannel } from './types.js'
