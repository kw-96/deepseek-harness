import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { listSkills, setSkillModelInvocation, userSkillsRoot } from '../src/host/skills.js'

afterEach(() => { vi.unstubAllEnvs() })

async function skillRoot(files: Readonly<Record<string, string>>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-manager-skills-'))
  vi.stubEnv('DSH_HOME', root)
  for (const [name, content] of Object.entries(files)) {
    const file = join(root, name)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, content, 'utf8')
  }
  return root
}

const visible = [
  '---\nname: alpha-skill\ndescription: 第一个技能\n---\n\nAlpha body.\n',
  '---\nname: beta-skill\ndescription: 第二个技能\ndisable-model-invocation: true\n---\n\nBeta body.\n',
]

describe('skills management', () => {
  it('derives the user skill root from DSH_HOME', () => {
    vi.stubEnv('DSH_HOME', 'C:/dsh-home')
    expect(userSkillsRoot()).toBe(join('C:/dsh-home', 'skills'))
  })

  it('lists parsed skills with their model-invocation state', async () => {
    const root = await skillRoot({ 'skills/alpha/SKILL.md': visible[0] as string, 'skills/beta/SKILL.md': visible[1] as string })
    const snapshot = await listSkills()
    expect(snapshot.skillsRoot).toBe(join(root, 'skills'))
    expect(snapshot.skills).toHaveLength(2)
    expect(snapshot.skills[0]).toMatchObject({
      name: 'alpha-skill', directory: 'alpha', description: '第一个技能', modelInvocable: true,
    })
    expect(snapshot.skills[1]).toMatchObject({
      name: 'beta-skill', directory: 'beta', description: '第二个技能', modelInvocable: false,
    })
  })

  it('treats a missing skills root as empty', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-manager-empty-'))
    vi.stubEnv('DSH_HOME', root)
    expect((await listSkills()).skills).toEqual([])
  })

  it('toggles the frontmatter flag and preserves the rest of the file', async () => {
    await skillRoot({ 'skills/alpha/SKILL.md': visible[0] as string })
    const receipt = await setSkillModelInvocation('alpha', false)
    expect(receipt.status).toBe('changed')
    expect(receipt.snapshot.skills[0]?.modelInvocable).toBe(false)
    const source = await readFile(receipt.snapshot.skills[0]?.source as string, 'utf8')
    expect(source).toContain('disable-model-invocation: true')
    expect(source).toContain('name: alpha-skill')
    expect(source).toContain('description: 第一个技能')
    expect(source).toContain('Alpha body.')
    const reEnabled = await setSkillModelInvocation('alpha', true)
    expect(reEnabled.status).toBe('changed')
    expect((await listSkills()).skills[0]?.modelInvocable).toBe(true)
  })

  it('updates an existing flag line without duplicating it', async () => {
    await skillRoot({ 'skills/beta/SKILL.md': visible[1] as string })
    const receipt = await setSkillModelInvocation('beta', true)
    expect(receipt.status).toBe('changed')
    const source = await readFile(receipt.snapshot.skills[0]?.source as string, 'utf8')
    expect(source.match(/disable-model-invocation/g)).toHaveLength(1)
    expect(source).toContain('disable-model-invocation: false')
  })

  it('fails loud for unknown skills and keeps the snapshot intact', async () => {
    await skillRoot({ 'skills/alpha/SKILL.md': visible[0] as string })
    const receipt = await setSkillModelInvocation('ghost', false)
    expect(receipt.status).toBe('failed')
    expect(receipt.message).toContain('未找到技能')
    expect(receipt.snapshot.skills).toHaveLength(1)
  })
})
