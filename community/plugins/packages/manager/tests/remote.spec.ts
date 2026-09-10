import { describe, expect, it } from 'vitest'
import { TYPERT, TYPERT_REMOTE } from '../src/remote.js'

describe('plugin manager Remote contribution', () => {
  it('publishes the same strict descriptors to Host and Client faces', () => {
    expect(TYPERT_REMOTE.descriptors.map(item => `${item.namespace}/${item.method}`)).toEqual([
      'pluginManager/list', 'pluginManager/setEnabled', 'pluginManager/setCategoryEnabled', 'pluginManager/setPackageEnabled',
      'pluginManager/listMcpServers', 'pluginManager/saveMcpServer', 'pluginManager/removeMcpServer', 'pluginManager/setMcpServerEnabled',
      'pluginManager/listSkills', 'pluginManager/setSkillModelInvocation',
    ])
    expect(TYPERT.invocations).toBe(TYPERT_REMOTE.descriptors)
    for (const descriptor of TYPERT_REMOTE.descriptors) {
      expect(descriptor.result.mode).toBe('strict')
      for (const parameter of descriptor.parameters) expect(parameter.codec.mode).toBe('strict')
    }
  })

  it('resolves every exported method to the service member the gateway must call', () => {
    // 别名方法的 descriptor 必须携带真实成员名，否则网关会按导出名取方法导致 method-unavailable
    const members = Object.fromEntries(TYPERT_REMOTE.descriptors.map(item => [item.method, item.implementation ?? item.method]))
    expect(members).toEqual({
      list: 'list',
      setEnabled: 'setEnabled',
      setCategoryEnabled: 'setCategoryEnabled',
      setPackageEnabled: 'setPackageEnabled',
      listMcpServers: 'listMcpServersRemote',
      saveMcpServer: 'saveMcpServerRemote',
      removeMcpServer: 'removeMcpServerRemote',
      setMcpServerEnabled: 'setMcpServerEnabledRemote',
      listSkills: 'listSkillsRemote',
      setSkillModelInvocation: 'setSkillModelInvocationRemote',
    })
  })
})
