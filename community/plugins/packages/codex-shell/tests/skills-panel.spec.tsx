// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SkillsPanel } from '../src/client/panels/skills/SkillsPanel.js'
import { zh } from '../src/client/locales.js'
import type { CodexSkillsManager, SkillLike } from '../src/client/RightPanel.js'

const t = (key: string): string => (zh as Record<string, string>)[key] ?? key

const skills: readonly SkillLike[] = [
  { name: 'banner-design', directory: 'banner-design', description: '设计横幅。', modelInvocable: true, source: 'C:/home/skills/banner-design/SKILL.md' },
  { name: 'brand', directory: 'brand', description: '品牌规范。', modelInvocable: false, source: 'C:/home/skills/brand/SKILL.md' },
]

function manager(overrides: Partial<CodexSkillsManager> = {}): CodexSkillsManager {
  return {
    listSkills: vi.fn(async () => ({ ok: true, value: { skillsRoot: 'C:/home/skills', skills } })),
    setSkillModelInvocation: vi.fn(async (skillName: string, enabled: boolean) => ({
      ok: true,
      value: {
        status: 'changed',
        message: null,
        snapshot: {
          skillsRoot: 'C:/home/skills',
          skills: skills.map(skill => skill.name === skillName ? { ...skill, modelInvocable: enabled } : skill),
        },
      },
    })),
    ...overrides,
  }
}

afterEach(cleanup)

describe('codex-shell SkillsPanel', () => {
  it('lists skills with description and model-invocation state', async () => {
    render(<SkillsPanel skillsManager={manager()} t={t} />)
    const rows = await screen.findAllByRole('listitem')
    expect(rows.map(row => row.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining('banner-design'), expect.stringContaining('brand'),
    ]))
    expect(screen.getByRole('listitem', { name: 'banner-design banner-design' }).textContent).toContain('模型可调用')
    expect(screen.getByRole('listitem', { name: 'brand brand' }).textContent).toContain('仅手动调用')
  })

  it('toggles model invocation through the remote', async () => {
    const mcp = manager()
    render(<SkillsPanel skillsManager={mcp} t={t} />)
    await screen.findAllByRole('listitem')
    fireEvent.click(screen.getAllByRole('checkbox', { name: '切换模型调用' })[0] as HTMLElement)
    await waitFor(() => expect(mcp.setSkillModelInvocation).toHaveBeenCalledWith('banner-design', false))
    expect((await screen.findAllByText('仅手动调用')).length).toBe(2)
  })

  it('filters skills with the search box', async () => {
    render(<SkillsPanel skillsManager={manager()} t={t} />)
    await screen.findAllByRole('listitem')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'brand' } })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('listitem', { name: 'brand brand' })).toBeTruthy()
  })

  it('renders the missing-manager empty state', () => {
    render(<SkillsPanel skillsManager={undefined} t={t} />)
    expect(screen.getByText('插件管家未挂载 Skills 能力，该面板不可用。')).toBeTruthy()
  })
})
