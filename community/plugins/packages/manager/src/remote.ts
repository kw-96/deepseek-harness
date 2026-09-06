/** Strict Typert Remote contribution shared by the Host registry and Web client. */
import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import type {
  McpMutationReceipt, McpServerInput, McpServersSnapshot, MutationReceipt, PluginCategory, PluginManagerSnapshot,
  SkillMutationReceipt, SkillsSnapshot,
} from './types.js'

const phase = z.union([z.literal(null), z.literal('pending'), z.literal('loading'), z.literal('active'), z.literal('failed'), z.literal('unloading')])
const entry = z.object({
  entryId: z.string(), configId: z.string(), moduleName: z.string(), packageName: z.string(),
  category: z.string(), group: z.string(), description: z.string().nullable(),
  enabled: z.boolean(), phase,
  protected: z.boolean(), protectionReason: z.string().nullable(), error: z.string().nullable(),
}).readonly()
const snapshot = z.object({ profileName: z.string(), categories: z.array(z.string()).readonly(), entries: z.array(entry).readonly() }).readonly()
const mutationItem = z.object({
  entryId: z.string(), status: z.union([z.literal('changed'), z.literal('restart-required'), z.literal('unchanged'), z.literal('skipped'), z.literal('failed')]), message: z.string().nullable(),
}).readonly()
const receipt = z.object({ enabled: z.boolean(), items: z.array(mutationItem).readonly(), snapshot }).readonly()
const category = z.enum(['official', 'third-party'])

const serverNameSchema = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/)
const stringRecord = z.record(z.string(), z.string())
const mcpServerInput: z.ZodType<McpServerInput> = z.union([
  z.object({
    serverName: serverNameSchema, transport: z.literal('stdio'), command: z.string().min(1),
    args: z.array(z.string()), env: stringRecord, cwd: z.string().nullable(),
    url: z.null(), headers: stringRecord, toolCallTimeoutMs: z.number().int().positive().nullable(),
  }).strict(),
  z.object({
    serverName: serverNameSchema, transport: z.literal('streamable-http'), command: z.null(),
    args: z.array(z.string()), env: stringRecord, cwd: z.null(),
    url: z.string().regex(/^https?:\/\//), headers: stringRecord, toolCallTimeoutMs: z.number().int().positive().nullable(),
  }).strict(),
])
const mcpServerRecord = z.object({
  id: z.string(), serverName: z.string(), transport: z.enum(['stdio', 'streamable-http']),
  command: z.string().nullable(), args: z.array(z.string()).readonly(), env: stringRecord.readonly(), cwd: z.string().nullable(),
  url: z.string().nullable(), headers: stringRecord.readonly(), toolCallTimeoutMs: z.number().nullable(),
  disabled: z.boolean(), managed: z.boolean(),
}).readonly()
const mcpSnapshot: z.ZodType<McpServersSnapshot> = z.object({
  profileName: z.string(), servers: z.array(mcpServerRecord).readonly(),
}).readonly()
const mcpReceipt: z.ZodType<McpMutationReceipt> = z.object({
  status: z.enum(['changed', 'removed', 'restart-required', 'failed']),
  message: z.string().nullable(), snapshot: mcpSnapshot,
}).readonly()
const skillRecord = z.object({
  name: z.string(), directory: z.string(), description: z.string().nullable(),
  modelInvocable: z.boolean(), source: z.string(),
}).readonly()
const skillsSnapshot: z.ZodType<SkillsSnapshot> = z.object({
  skillsRoot: z.string(), skills: z.array(skillRecord).readonly(),
}).readonly()
const skillReceipt: z.ZodType<SkillMutationReceipt> = z.object({
  status: z.enum(['changed', 'failed']), message: z.string().nullable(), snapshot: skillsSnapshot,
}).readonly()

const strict = (typeSymbol: string, schema: z.ZodType) => ({ mode: 'strict' as const, typeSymbol, schema })
const parameter = (name: string, schema: z.ZodType) => ({ name, wire: name, source: 'json' as const, codec: strict(`dsh-plugin-manager/types#${name}`, schema) })
const descriptor = (method: string, parameters: readonly ReturnType<typeof parameter>[], result: z.ZodType, typeName = 'MutationReceipt') => ({
  id: `dsh-plugin-manager#pluginManager/${method}`,
  service: 'pluginManager', namespace: 'pluginManager', method, invocation: { kind: 'direct' as const }, parameters,
  result: strict(`dsh-plugin-manager/types#${typeName}`, result),
})

const descriptors = [
  descriptor('list', [], snapshot, 'PluginManagerSnapshot'),
  descriptor('setEnabled', [parameter('entryId', z.string()), parameter('enabled', z.boolean())], receipt),
  descriptor('setCategoryEnabled', [parameter('category', category), parameter('enabled', z.boolean())], receipt),
  descriptor('setPackageEnabled', [parameter('packageName', z.string()), parameter('enabled', z.boolean())], receipt),
  descriptor('listMcpServers', [], mcpSnapshot, 'McpServersSnapshot'),
  descriptor('saveMcpServer', [parameter('input', mcpServerInput), parameter('enabled', z.boolean())], mcpReceipt, 'McpMutationReceipt'),
  descriptor('removeMcpServer', [parameter('serverName', z.string())], mcpReceipt, 'McpMutationReceipt'),
  descriptor('setMcpServerEnabled', [parameter('serverName', z.string()), parameter('enabled', z.boolean())], mcpReceipt, 'McpMutationReceipt'),
  descriptor('listSkills', [], skillsSnapshot, 'SkillsSnapshot'),
  descriptor('setSkillModelInvocation', [parameter('skillName', z.string()), parameter('enabled', z.boolean())], skillReceipt, 'SkillMutationReceipt'),
] as const

export const TYPERT_REMOTE: TypertRemoteContribution = { package: 'dsh-plugin-manager', descriptors }

/** Host Typert artifact loaded from the package's `./typert` export. */
export const TYPERT = {
  package: 'dsh-plugin-manager', face: 'host', schemas: [], invocations: descriptors,
  model: { services: [], events: [], objects: [] },
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    'pluginManager/list': () => Promise<RemoteResult<PluginManagerSnapshot>>
    'pluginManager/setEnabled': (entryId: string, enabled: boolean) => Promise<RemoteResult<MutationReceipt>>
    'pluginManager/setCategoryEnabled': (category: PluginCategory, enabled: boolean) => Promise<RemoteResult<MutationReceipt>>
    'pluginManager/setPackageEnabled': (packageName: string, enabled: boolean) => Promise<RemoteResult<MutationReceipt>>
    'pluginManager/listMcpServers': () => Promise<RemoteResult<McpServersSnapshot>>
    'pluginManager/saveMcpServer': (input: McpServerInput, enabled: boolean) => Promise<RemoteResult<McpMutationReceipt>>
    'pluginManager/removeMcpServer': (serverName: string) => Promise<RemoteResult<McpMutationReceipt>>
    'pluginManager/setMcpServerEnabled': (serverName: string, enabled: boolean) => Promise<RemoteResult<McpMutationReceipt>>
    'pluginManager/listSkills': () => Promise<RemoteResult<SkillsSnapshot>>
    'pluginManager/setSkillModelInvocation': (skillName: string, enabled: boolean) => Promise<RemoteResult<SkillMutationReceipt>>
  }
  interface TypertRemoteNamespaceMap {
    pluginManager: {
      list: () => Promise<RemoteResult<PluginManagerSnapshot>>
      setEnabled: (entryId: string, enabled: boolean) => Promise<RemoteResult<MutationReceipt>>
      setCategoryEnabled: (category: PluginCategory, enabled: boolean) => Promise<RemoteResult<MutationReceipt>>
      setPackageEnabled: (packageName: string, enabled: boolean) => Promise<RemoteResult<MutationReceipt>>
      listMcpServers: () => Promise<RemoteResult<McpServersSnapshot>>
      saveMcpServer: (input: McpServerInput, enabled: boolean) => Promise<RemoteResult<McpMutationReceipt>>
      removeMcpServer: (serverName: string) => Promise<RemoteResult<McpMutationReceipt>>
      setMcpServerEnabled: (serverName: string, enabled: boolean) => Promise<RemoteResult<McpMutationReceipt>>
      listSkills: () => Promise<RemoteResult<SkillsSnapshot>>
      setSkillModelInvocation: (skillName: string, enabled: boolean) => Promise<RemoteResult<SkillMutationReceipt>>
    }
  }
}

export default TYPERT_REMOTE
