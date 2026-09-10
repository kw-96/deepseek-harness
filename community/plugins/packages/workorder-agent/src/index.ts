import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { loadConfig } from './config.js'

const config = loadConfig()
const runtime = await createApp(config)
const server = serve({ fetch: runtime.app.fetch, hostname: '127.0.0.1', port: config.port })
console.log(`工单提醒服务已启动：http://127.0.0.1:${config.port}`)

async function shutdown(): Promise<void> {
  server.close()
  await runtime.close()
}

process.once('SIGINT', () => void shutdown())
process.once('SIGTERM', () => void shutdown())
