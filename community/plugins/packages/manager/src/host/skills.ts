/**
 * Skills 管理：扫描用户技能根（$DSH_HOME/skills）列出技能，并通过编辑
 * SKILL.md 前言的 disable-model-invocation 标记启停模型调用。编辑只改
 * 标记行，其余前言与正文保持原字节。
 * @module dsh-plugin-manager/skills
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { parseDocument } from 'yaml'
import type { SkillMutationReceipt, SkillsSnapshot } from '../types.js'

/** 用户技能根：与 skill-filesystem 的 user-dsh 根一致。 */
export function userSkillsRoot(): string {
  return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'skills')
}

interface FrontmatterView {
  readonly name?: unknown
  readonly description?: unknown
  readonly 'disable-model-invocation'?: unknown
}

interface ParsedSkill {
  readonly directory: string
  readonly source: string
  readonly name: string | null
  readonly description: string | null
  readonly disableModelInvocation: boolean
}

/** 解析一个技能目录：SKILL.md 存在且前言可解析才计入。 */
async function parseSkillDirectory(root: string, directory: string): Promise<ParsedSkill | null> {
  const skillFile = join(root, directory, 'SKILL.md')
  try {
    if (!(await stat(skillFile)).isFile()) return null
    const source = await readFile(skillFile, 'utf8')
    const view = frontmatterOf(source)
    if (view === undefined) return null
    const name = typeof view.name === 'string' && view.name.trim() !== '' ? view.name.trim() : directory
    const description = typeof view.description === 'string' && view.description.trim() !== '' ? view.description.trim() : null
    return {
      directory,
      source: skillFile,
      name,
      description,
      disableModelInvocation: view['disable-model-invocation'] === true,
    }
  } catch {
    return null
  }
}

/** 提取文件开头的 YAML 前言；无前言返回 undefined。 */
function frontmatterOf(source: string): FrontmatterView | undefined {
  if (!source.startsWith('---')) return undefined
  const end = source.indexOf('\n---', 3)
  if (end === -1) return undefined
  const document = parseDocument(source.slice(4, end))
  if (document.errors.length > 0 || typeof document.contents === 'string' || document.contents === null) return undefined
  return document.toJS() as FrontmatterView
}

/** 列出用户技能根中的全部技能。 */
export async function listSkills(): Promise<SkillsSnapshot> {
  const root = userSkillsRoot()
  let entries: string[] = []
  try {
    entries = await readdir(root)
  } catch {
    return { skillsRoot: root, skills: [] }
  }
  const skills = (await Promise.all(entries.map(directory => parseSkillDirectory(root, directory))))
    .filter((skill): skill is ParsedSkill => skill !== null)
    .sort((left, right) => left.directory.localeCompare(right.directory))
  return {
    skillsRoot: root,
    skills: skills.map(skill => ({
      name: skill.name as string,
      directory: skill.directory,
      description: skill.description,
      modelInvocable: !skill.disableModelInvocation,
      source: skill.source,
    })),
  }
}

/**
 * 启停一个技能的模型调用：把前言标记设为对应值（缺行则插入），
 * 其余前言键与正文保持不变。
 */
export async function setSkillModelInvocation(skillName: string, enabled: boolean): Promise<SkillMutationReceipt> {
  try {
    const snapshot = await listSkills()
    const target = snapshot.skills.find(skill => skill.directory === skillName || skill.name === skillName)
    if (target === undefined) throw new Error(`未找到技能 ${skillName}。`)
    const source = await readFile(target.source, 'utf8')
    const end = source.indexOf('\n---', 3)
    if (end === -1) throw new Error(`${target.directory} 的 SKILL.md 缺少 YAML 前言。`)
    const frontmatter = source.slice(0, end)
    const body = source.slice(end)
    const desired = enabled ? 'false' : 'true'
    const linePattern = /^(\s*disable-model-invocation\s*:).*$/m
    const next = linePattern.test(frontmatter)
      ? frontmatter.replace(linePattern, `$1 ${desired}`)
      : `${frontmatter}\ndisable-model-invocation: ${desired}`
    await writeFile(target.source, `${next}${body}`, 'utf8')
    return { status: 'changed', message: null, snapshot: await listSkills() }
  } catch (error) {
    return {
      status: 'failed',
      message: error instanceof Error ? error.message : String(error),
      snapshot: await listSkills(),
    }
  }
}
