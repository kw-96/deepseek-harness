/**
 * 极简 WebSocket 服务端实现（RFC 6455 子集）。
 * 只实现本插件需要的部分：握手、二进制/文本帧收发、ping/pong、close、分片重组。
 * 之所以不用 ws 库：社区插件的 workspace 正在被其它进程安装依赖，且这里零依赖更易部署。
 */
import { createHash } from 'node:crypto'

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const MAX_PAYLOAD = 32 * 1024 * 1024

/**
 * 在已升级的原始 socket 上完成 WebSocket 握手并返回连接对象。
 * @param {import('node:http').IncomingMessage} req 升级请求
 * @param {import('node:stream').Duplex} socket 原始 socket
 * @param {Buffer} head 升级时已读取的剩余字节
 * @param {(data: Buffer) => void} onMessage 收到完整消息时回调
 * @param {() => void} onClose 连接关闭时回调
 * @returns {{ send: (data: Buffer | string) => void, close: () => void, isOpen: () => boolean }}
 */
export function acceptWebSocket(req, socket, head, onMessage, onClose) {
  const key = req.headers['sec-websocket-key']
  if (typeof key !== 'string' || key.length === 0) {
    socket.destroy()
    throw new Error('websocket: 缺少 Sec-WebSocket-Key')
  }
  const accept = createHash('sha1').update(key + GUID).digest('base64')
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '',
    '',
  ].join('\r\n'))

  let open = true
  let buffer = Buffer.alloc(0)
  /** 分片消息的累积缓冲 */
  let fragments = []
  let fragmentOpcode = 0

  const sendFrame = (opcode, payload) => {
    if (!open) return
    const len = payload.length
    let header
    if (len < 126) {
      header = Buffer.alloc(2)
      header[1] = len
    } else if (len < 65536) {
      header = Buffer.alloc(4)
      header[1] = 126
      header.writeUInt16BE(len, 2)
    } else {
      header = Buffer.alloc(10)
      header[1] = 127
      header.writeBigUInt64BE(BigInt(len), 2)
    }
    header[0] = 0x80 | opcode
    try {
      socket.write(header)
      if (len > 0) socket.write(payload)
    } catch {
      close()
    }
  }

  const close = () => {
    if (!open) return
    open = false
    try { sendFrame(0x8, Buffer.alloc(0)) } catch { /* 忽略关闭时写失败 */ }
    try { socket.destroy() } catch { /* 已销毁 */ }
    onClose()
  }

  const handleFrame = (fin, opcode, payload) => {
    if (opcode === 0x8) { close(); return }
    if (opcode === 0x9) { sendFrame(0xa, payload); return }
    if (opcode === 0xa) return
    if (opcode === 0x0) {
      fragments.push(payload)
      if (fin) {
        const full = Buffer.concat(fragments)
        fragments = []
        if (fragmentOpcode === 0x1 || fragmentOpcode === 0x2) onMessage(full)
      }
      return
    }
    if (fin) {
      onMessage(payload)
      return
    }
    fragmentOpcode = opcode
    fragments = [payload]
  }

  const onData = (chunk) => {
    buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk])
    for (;;) {
      if (buffer.length < 2) return
      const fin = (buffer[0] & 0x80) !== 0
      const opcode = buffer[0] & 0x0f
      const masked = (buffer[1] & 0x80) !== 0
      let len = buffer[1] & 0x7f
      let offset = 2
      if (len === 126) {
        if (buffer.length < offset + 2) return
        len = buffer.readUInt16BE(offset); offset += 2
      } else if (len === 127) {
        if (buffer.length < offset + 8) return
        const big = buffer.readBigUInt64BE(offset); offset += 8
        if (big > BigInt(MAX_PAYLOAD)) { close(); return }
        len = Number(big)
      }
      if (len > MAX_PAYLOAD) { close(); return }
      let maskKey = null
      if (masked) {
        if (buffer.length < offset + 4) return
        maskKey = buffer.subarray(offset, offset + 4); offset += 4
      }
      if (buffer.length < offset + len) return
      const payload = Buffer.from(buffer.subarray(offset, offset + len))
      buffer = buffer.subarray(offset + len)
      if (maskKey) {
        for (let i = 0; i < payload.length; i += 1) payload[i] ^= maskKey[i & 3]
      }
      handleFrame(fin, opcode, payload)
      if (!open) return
    }
  }

  socket.on('data', onData)
  socket.on('error', () => close())
  socket.on('close', () => { if (open) { open = false; onClose() } })
  if (head !== undefined && head.length > 0) onData(head)

  return {
    send: (data) => sendFrame(0x2, Buffer.isBuffer(data) ? data : Buffer.from(data)),
    close,
    isOpen: () => open,
  }
}
