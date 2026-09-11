/**
 * gitPanel 描述符契约：网关默认要求每个声明的 JSON 参数出现在 args 里，
 * 而 `undefined` 会在序列化时消失——可省参数必须声明 acceptsUndefined。
 */

import { describe, expect, it } from 'vitest'
import { TYPERT_REMOTE } from '../src/remote.js'

const descriptors = TYPERT_REMOTE.descriptors

describe('gitPanel descriptors', () => {
  it('exposes exactly the panel operations', () => {
    expect(descriptors.map(descriptor => descriptor.method)).toEqual([
      'status', 'log', 'diff', 'show', 'showFile', 'branches', 'checkout', 'createBranch',
      'lastMessage', 'discard', 'stage', 'unstage', 'stageAll', 'unstageAll',
      'commit', 'setIdentity', 'push', 'pull', 'fetch', 'identity', 'message',
    ])
  })

  it('declares its optional log limit so an omitted field is accepted', () => {
    const log = descriptors.find(descriptor => descriptor.method === 'log')
    expect(log?.parameters.map(parameter => [parameter.name, parameter.acceptsUndefined === true]))
      .toEqual([['cwd', false], ['limit', true]])
  })

  it('keeps every required parameter present after a JSON round trip', () => {
    for (const descriptor of descriptors) {
      const required = descriptor.parameters.filter(parameter => parameter.acceptsUndefined !== true)
      const args = Object.fromEntries(required.map(parameter => [parameter.name, 'x']))
      const wire = JSON.parse(JSON.stringify(args)) as Record<string, unknown>
      const missing = required.filter(parameter => !Object.hasOwn(wire, parameter.name))
      expect(missing.map(parameter => `${descriptor.method}.${parameter.name}`)).toEqual([])
    }
  })
})
