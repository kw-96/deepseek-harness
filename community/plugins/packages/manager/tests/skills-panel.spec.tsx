// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SkillsPanel, type SkillsPanelProps } from '../src/client/skills/SkillsPanel.js'
import { en, type LocaleKey } from '../src/client/locales.js'
import type { SkillMutationReceipt, SkillsSnapshot } from '../src/types.js'

afterEach(cleanup)
const t = (key: LocaleKey): string => en[key]

const docSkill = {
  name: 'Document editing', directory: 'doc-edit', description: 'Edit and review documents',
  modelInvocable: true, source: 'C:\\Users\\demo\\.dsh\\skills\\doc-edit\\SKILL.md',
}
const drawSkill = {
  name: 'Diagram', directory: 'diagram', description: null,
  modelInvocable: false, source: 'C:\\Users\\demo\\.dsh\\skills\\diagram\\SKILL.md',
}
const snapshot: SkillsSnapshot = { skillsRoot: 'C:\\Users\\demo\\.dsh\\skills', skills: [docSkill, drawSkill] }

function receipt(next: SkillsSnapshot, status: 'changed' | 'failed' = 'changed', message: string | null = null): SkillMutationReceipt {
  return { status, message, snapshot: next }
}

function props(overrides: Partial<SkillsPanelProps> = {}): SkillsPanelProps {
  return {
    t,
    locale: 'en',
    list: vi.fn(async () => snapshot),
    setModelInvocation: vi.fn(async () => receipt(snapshot)),
    ...overrides,
  }
}

describe('SkillsPanel', () => {
  it('lists skills with names, directories, and descriptions', async () => {
    render(<SkillsPanel {...props()} />)
    expect(await screen.findByText('Document editing')).toBeTruthy()
    expect(screen.getByText('doc-edit')).toBeTruthy()
    expect(screen.getByText('Edit and review documents')).toBeTruthy()
    expect(screen.getByText('Diagram')).toBeTruthy()
    expect(screen.getByText('diagram')).toBeTruthy()
    expect(screen.getByText(snapshot.skillsRoot)).toBeTruthy()
  })

  it('toggles model invocation by directory and adopts the receipt snapshot', async () => {
    const next: SkillsSnapshot = { ...snapshot, skills: [{ ...docSkill, modelInvocable: false }, drawSkill] }
    const setModelInvocation = vi.fn(async () => receipt(next))
    render(<SkillsPanel {...props({ setModelInvocation })} />)
    const toggle = await screen.findByRole('checkbox', { name: 'Document editing: Allow model invocation' })
    expect(toggle).toHaveProperty('checked', true)
    fireEvent.click(toggle)
    await waitFor(() => { expect(setModelInvocation).toHaveBeenCalledWith('doc-edit', false) })
    const updated = await screen.findByRole('checkbox', { name: 'Document editing: Allow model invocation' })
    expect(updated).toHaveProperty('checked', false)
  })

  it('shows a failed receipt as an alert and adopts its snapshot', async () => {
    const empty: SkillsSnapshot = { ...snapshot, skills: [] }
    const setModelInvocation = vi.fn(async () => receipt(empty, 'failed', 'SKILL.md frontmatter is invalid.'))
    render(<SkillsPanel {...props({ setModelInvocation })} />)
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Document editing: Allow model invocation' }))
    expect((await screen.findByRole('alert')).textContent).toContain('SKILL.md frontmatter is invalid.')
    expect(screen.getByText(en.skillsEmpty)).toBeTruthy()
  })

  it('retries a failed initial load and refreshes on demand', async () => {
    const empty: SkillsSnapshot = { ...snapshot, skills: [] }
    const list = vi.fn()
      .mockRejectedValueOnce(new Error('private'))
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce(empty)
    render(<SkillsPanel {...props({ list })} />)
    expect((await screen.findByRole('alert')).textContent).toContain(`${en.error} private`)
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    await screen.findByText('Document editing')
    fireEvent.click(screen.getByRole('button', { name: en.skillsRefresh }))
    await screen.findByText(en.skillsEmpty)
    expect(list).toHaveBeenCalledTimes(3)
  })

  it('shows the empty text when the skills root has no skills', async () => {
    const empty: SkillsSnapshot = { ...snapshot, skills: [] }
    render(<SkillsPanel {...props({ list: vi.fn(async () => empty) })} />)
    expect(await screen.findByText(en.skillsEmpty)).toBeTruthy()
  })

  it('ignores a late list result after unmount', async () => {
    const deferred = Promise.withResolvers<SkillsSnapshot>()
    const view = render(<SkillsPanel {...props({ list: () => deferred.promise })} />)
    view.unmount()
    await act(async () => { deferred.resolve(snapshot) })
  })
})
