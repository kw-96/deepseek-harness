// @vitest-environment jsdom
/** 通道状态在底部栏的呈现，以及「改用 SSH」动作的触发。 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GitBody, type GitBodyProps } from '../../src/client/panel/GitBody.js'
import { api, blockedStatus, okStatus, sessions, t } from './support.js'

/** 组装渲染所需的运行时 props。 */
function props(over: Parameters<typeof api>[0] = {}): GitBodyProps {
  return {
    sessionId: 's1',
    useSessions: ((selector: (value: unknown) => unknown) => selector(sessions())) as never,
    t,
    api: api(over),
  } as GitBodyProps
}

afterEach(cleanup)

describe('底部栏通道状态', () => {
  // 底部栏空间紧张，状态文案由按钮的 title 承载，正文只留图标。
  it('通道正常时以 title 说明，且不出现修复动作', async () => {
    render(<GitBody {...props()} />)
    const chip = await screen.findByRole('button', { name: '重新探测网络通道' })
    await waitFor(() => expect(chip.getAttribute('title')).toContain('HTTPS 通道正常'))
    expect(screen.queryByRole('button', { name: '改用 SSH' })).toBeNull()
    expect(chip.getAttribute('title')).not.toContain('被阻断')
  })

  it('HTTPS 被阻断时如实说明，并给出「改用 SSH」动作', async () => {
    const channelStatus = vi.fn(async () => blockedStatus)
    render(<GitBody {...props({ channelStatus })} />)
    const chip = await screen.findByRole('button', { name: '重新探测网络通道' })
    await waitFor(() => expect(chip.getAttribute('title')).toContain('被阻断'))
    expect(await screen.findByRole('button', { name: '改用 SSH' })).toBeTruthy()
  })

  it('点击「改用 SSH」即把远程切换为 SSH 形态', async () => {
    const channelStatus = vi.fn(async () => blockedStatus)
    const switchRemote = vi.fn(async () => ({
      url: 'git@github.com:kw-96/deepseek-harness.git', detail: '已切换',
    }))
    render(<GitBody {...props({ channelStatus, switchRemote })} />)
    fireEvent.click(await screen.findByRole('button', { name: '改用 SSH' }))
    await waitFor(() => expect(switchRemote).toHaveBeenCalledWith('E:/repo', 'ssh'))
  })

  it('点击状态区可重新探测通道', async () => {
    const channelStatus = vi.fn(async () => okStatus)
    render(<GitBody {...props({ channelStatus })} />)
    const chip = await screen.findByRole('button', { name: '重新探测网络通道' })
    await waitFor(() => expect(channelStatus).toHaveBeenCalledTimes(1))
    fireEvent.click(chip)
    await waitFor(() => expect(channelStatus).toHaveBeenCalledTimes(2))
  })

  it('两种通道都不可用时给出说明而不是修复动作', async () => {
    const channelStatus = vi.fn(async () => ({
      ...blockedStatus, advice: 'no-channel' as const, ssh: { port22: false, port443: false },
      note: 'HTTPS 与 SSH 通道都不可用，请检查网络设置',
    }))
    render(<GitBody {...props({ channelStatus })} />)
    const chip = await screen.findByRole('button', { name: '重新探测网络通道' })
    await waitFor(() => expect(chip.getAttribute('title')).toContain('都不可用'))
    expect(screen.queryByRole('button', { name: '改用 SSH' })).toBeNull()
  })
})
